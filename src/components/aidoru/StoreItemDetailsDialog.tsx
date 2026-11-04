import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

export type StoreItemDetails = {
  name: string;
  description: string;
  category: string;
  price: string;
  image?: string | null;
  rarity?: string | null;
  details?: Array<{ label: string; value: string }>;
};

export function StoreItemDetailsDialog({
  item,
  open,
  onOpenChange,
}: {
  item: StoreItemDetails | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto border-border bg-card">
        {item && (
          <div className="space-y-5">
            <div className="flex items-center gap-4">
              {item.image ? (
                <div className="grid size-20 shrink-0 place-items-center rounded-xl bg-muted/40 p-2">
                  <img src={item.image} alt="" className="size-full object-contain" />
                </div>
              ) : null}
              <div className="min-w-0">
                <DialogTitle className="text-xl">{item.name}</DialogTitle>
                <DialogDescription className="mt-1 capitalize">{item.category}</DialogDescription>
              </div>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">{item.description}</p>
            <dl className="grid grid-cols-2 gap-2 rounded-xl border border-border/70 bg-muted/20 p-3 text-sm">
              <dt className="text-muted-foreground">Price</dt>
              <dd className="text-right font-semibold">{item.price}</dd>
              {item.rarity && (
                <>
                  <dt className="text-muted-foreground">Rarity</dt>
                  <dd className="text-right capitalize">{item.rarity}</dd>
                </>
              )}
              {item.details?.map((detail) => (
                <div key={detail.label} className="contents">
                  <dt className="text-muted-foreground">{detail.label}</dt>
                  <dd className="text-right">{detail.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
