export type ComposeFlyerInput = {
  brief: string;
  imageUrl: string;
  brandName?: string;
};

export type ComposeFlyerResult = {
  url: string;
  templateId: string;
};

export interface CanvaProvider {
  composeFlyer(input: ComposeFlyerInput): Promise<ComposeFlyerResult>;
}
