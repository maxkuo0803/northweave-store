import { formatPrice } from "@/lib/store-config";

export function Price({ price, salePrice, className = "text-sm" }: { price: number; salePrice?: number | null; className?: string }) {
  if (salePrice) {
    return (
      <p className={className}>
        <span className="font-medium text-accent">{formatPrice(salePrice)}</span>
        <span className="ml-2 text-muted line-through">{formatPrice(price)}</span>
      </p>
    );
  }
  return <p className={`${className} font-medium`}>{formatPrice(price)}</p>;
}
