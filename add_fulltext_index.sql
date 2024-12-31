-- Add FULLTEXT index to stock table for cStockDesc column
ALTER TABLE eisdata.stock ADD FULLTEXT INDEX ft_stock_desc (cStockDesc);
