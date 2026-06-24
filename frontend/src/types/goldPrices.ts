export type GoldPrice = {
  id: string;
  tenantId: string;
  priceDate: string;
  brlPerGram: number;
  recordedBy: string;
  notes?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  supersededGoldPriceId?: string;
};

export type CreateGoldPriceInput = {
  priceDate: string;
  brlPerGram: number;
  recordedBy: string;
  notes?: string;
};
