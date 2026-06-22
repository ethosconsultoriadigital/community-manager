export type ComposeFlyerInput = {
  brief: string;
  imageUrl: string;
  brandName?: string;
  agencyId: string;
  clientId: string;
  brandTemplateId?: string;
};

export type ComposeFlyerResult = {
  url: string;
  templateId: string;
  provider?: 'mock' | 'canva-connect';
  designId?: string;
};

export interface CanvaProvider {
  composeFlyer(input: ComposeFlyerInput): Promise<ComposeFlyerResult>;
}
