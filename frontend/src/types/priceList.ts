export type PriceListItemType = "CANTEEN" | "ADMINISTRATIVE" | string;

export type PriceListItem = {
  id: string;
  tenantId: string;
  itemType: PriceListItemType;
  code: string;
  description: string;
  unitPriceBrl: number;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type PriceListItemListFilter = {
  itemType?: PriceListItemType;
  includeInactive?: boolean;
};
