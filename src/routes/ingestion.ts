import { Router, Request, Response } from 'express';
import { getPool } from '../lib/db';
import { runIngestionPipeline, IngestionInput } from '../services/ingestion/ingestionPipeline';
import { detectFileType, isStructuredType } from '../services/ingestion/fileTypeDetector';

export const ingestionRouter = Router();

/**
 * POST /api/ingestion/parse
 * Ingest a structured file (PDF, spreadsheet, design) into parsed units
 * and link them to the context graph.
 */
ingestionRouter.post('/api/ingestion/parse', async (req: Request, res: Response) => {
  try {
    const { file_id, file_name, content, project_id, sheets, components, file_type_override } = req.body;

    if (!file_id || !file_name || !project_id) {
      res.status(400).json({ error: 'file_id, file_name, and project_id are required' });
      return;
    }
    if (!content && !sheets && !components) {
      res.status(400).json({ error: 'content, sheets, or components must be provided' });
      return;
    }

    const fileType = detectFileType(file_name, file_type_override);
    if (!isStructuredType(fileType)) {
      res.status(400).json({ error: `File type "${fileType}" does not support section-based parsing. Use pdf, spreadsheet, or design files.` });
      return;
    }

    let input: IngestionInput;
    switch (fileType) {
      case 'pdf':
        input = { fileType: 'pdf', content: content || '' };
        break;
      case 'spreadsheet':
        input = { fileType: 'spreadsheet', content: content || '', sheets };
        break;
      case 'design':
        input = { fileType: 'design', content: content || '', components };
        break;
      default:
        res.status(400).json({ error: `Unsupported structured file type: ${fileType}` });
        return;
    }

    const result = runIngestionPipeline(file_id, file_name, input);

    // Store parsed units and create context graph nodes/edges
    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      for (const unit of result.units) {
        // Insert parsed unit
        const { rows: unitRows } = await client.query(
          `INSERT INTO parsed_units (file_id, unit_type, unit_index, title, content, summary, metadata, token_count, content_hash, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'parsed')
           RETURNING id`,
          [file_id, unit.unitType, unit.unitIndex, unit.title, unit.content, unit.summary,
           JSON.stringify(unit.metadata), unit.tokenCount, unit.contentHash],
        );
        const parsedUnitId = unitRows[0].id;

        // Create a context_node for this unit
        const nodeMetadata = {
          ...unit.metadata,
          summary: unit.summary,
          content: unit.content,
          parsed_unit_id: parsedUnitId,
          file_id,
          file_name: result.fileName,
        };
        const { rows: nodeRows } = await client.query(
          `INSERT INTO context_nodes (project_id, type, metadata)
           VALUES ($1, $2, $3)
           RETURNING id`,
          [project_id, unit.unitType, JSON.stringify(nodeMetadata)],
        );
        const nodeId = nodeRows[0].id;

        // Link parsed_unit to its context_node
        await client.query(
          `UPDATE parsed_units SET context_node_id = $1 WHERE id = $2`,
          [nodeId, parsedUnitId],
        );

        // Find the parent artifact's context_node (if it exists) and create CONTAINS edge
        const { rows: parentNodes } = await client.query(
          `SELECT id FROM context_nodes
           WHERE project_id = $1 AND metadata->>'file_id' = $2 AND type NOT IN ('pdf_section', 'spreadsheet_sheet', 'design_component')
           LIMIT 1`,
          [project_id, file_id],
        );

        if (parentNodes.length > 0) {
          await client.query(
            `INSERT INTO context_edges (source_id, target_id, type, metadata)
             VALUES ($1, $2, 'CONTAINS', $3)`,
            [parentNodes[0].id, nodeId, JSON.stringify({ unit_index: unit.unitIndex })],
          );
        }
      }

      // Store errors for failed units
      for (const error of result.errors) {
        if (error.unitIndex >= 0) {
          await client.query(
            `INSERT INTO parsed_units (file_id, unit_type, unit_index, title, content, summary, token_count, content_hash, status, error_message)
             VALUES ($1, $2, $3, $4, '', '', 0, '', 'error', $5)`,
            [file_id, getUnitTypeForFileType(fileType), error.unitIndex, error.title, error.error],
          );
        }
      }

      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    res.status(201).json({
      data: {
        file_id: result.fileId,
        file_name: result.fileName,
        file_type: result.fileType,
        unit_counts: result.unitCounts,
        errors: result.errors,
      },
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * GET /api/ingestion/:fileId/units
 * List parsed units for a given file.
 */
ingestionRouter.get('/api/ingestion/:fileId/units', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT id, file_id, unit_type, unit_index, title, summary, token_count, status, error_message, context_node_id, created_at
       FROM parsed_units
       WHERE file_id = $1
       ORDER BY unit_index`,
      [req.params.fileId],
    );

    res.json({ data: rows, total: rows.length });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

function getUnitTypeForFileType(fileType: string): string {
  switch (fileType) {
    case 'pdf': return 'pdf_section';
    case 'spreadsheet': return 'spreadsheet_sheet';
    case 'design': return 'design_component';
    default: return 'unknown';
  }
}
