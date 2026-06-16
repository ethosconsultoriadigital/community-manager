export type SheetRow = {
  external_id: string;
  captured_at?: string;
  origin?: string;
  source_url?: string;
  title?: string;
  summary?: string;
  category?: string;
  sentiment?: string;
  sentiment_score?: number;
  sentiment_reason?: string;
  image_url?: string;
  copy_facebook?: string;
  copy_instagram?: string;
  copy_x?: string;
  hashtags?: string[];
  flagged_publish?: boolean;
};

export type IngestSheetInput = {
  config: Record<string, unknown>;
};

export type IngestSheetResult = {
  rows: SheetRow[];
};

export interface SheetIngestProvider {
  fetchRows(input: IngestSheetInput): Promise<IngestSheetResult>;
}
