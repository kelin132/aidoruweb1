import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { fetchMyCardDecks, saveMyCardDecks } from "@/lib/aidoru.functions";
import type { OwnedCard } from "@/lib/game";

type CardDeck = { id: string; name: string; cardIds: string[] };

export function ProfileCardDeckBuilder({ cards }: { cards: OwnedCard[] }) {
  const queryClient = useQueryClient();
  const deckQueryKey = deckQueryKey as const;
  const fetchDecks = useServerFn(fetchMyCardDecks);
  const saveDecks = useServerFn(saveMyCardDecks);
  const deckQuery = useQuery({ queryKey: deckQueryKey, queryFn: fetchDecks, staleTime: 30_000, retry: false });
  const decks = deckQuery.data ?? [];
  const [activeId, setActiveId] = useState("");
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const activeDeck = decks.find((deck) => deck.id === activeId) ?? decks[0];
  const mutation = useMutation({
    mutationFn: (next: CardDeck[]) => saveDecks({ data: { decks: next } }),
    retry: 1,
    retryDelay: 500,
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: deckQueryKey });
      const previous = queryClient.getQueryData<CardDeck[]>(deckQueryKey);
      queryClient.setQueryData(deckQueryKey, next);
      return { previous };
    },
    onSuccess: (saved) => { queryClient.setQueryData(deckQueryKey, saved); },
    onError: (error, _next, context) => {
      if (context?.previous) queryClient.setQueryData(deckQueryKey, context.previous);
      else queryClient.removeQueries({ queryKey: deckQueryKey, exact: true });
      const message = error instanceof TypeError && /fetch/i.test(error.message)
        ? "Could not reach the server to save this deck. Check your connection and try again."
        : error instanceof Error ? error.message : "Could not save your decks.";
      toast.error(message);
    },
  });
  useEffect(() => { if (decks.length && !decks.some((deck) => deck.id === activeId)) setActiveId(decks[0].id); }, [decks, activeId]);
  const cardById = useMemo(() => new Map(cards.map((card) => [card.cardId, card])), [cards]);
  const filteredCards = useMemo(() => { const q = search.trim().toLowerCase(); return cards.filter((card) => !q || `${card.name} ${card.series} ${card.tier}`.toLowerCase().includes(q)).slice(0, 80); }, [cards, search]);
  const persist = (next: CardDeck[]) => mutation.mutate(next);
  const createDeck = () => {
    const trimmed = name.trim();
    if (!trimmed) return toast.error("Enter a deck name first.");
    if (decks.length >= 10) return toast.error("You can create up to 10 decks.");
    const id = globalThis.crypto?.randomUUID?.() ?? `deck-${Date.now()}`;
    const next = [...decks, { id, name: trimmed.slice(0, 32), cardIds: [] }];
    mutation.mutate(next, { onSuccess: (saved) => { queryClient.setQueryData(deckQueryKey, saved); setActiveId(id); setName(""); setSelectedCardIds([]); toast.success("Deck created."); } });
  };
  const updateActive = (update: (deck: CardDeck) => CardDeck) => { if (!activeDeck) return; persist(decks.map((deck) => deck.id === activeDeck.id ? update(deck) : deck)); };
  const toggleCardSelection = (cardId: string) => {
    if (!activeDeck || activeDeck.cardIds.includes(cardId)) return;
    const slots = 12 - activeDeck.cardIds.length;
    if (!selectedCardIds.includes(cardId) && selectedCardIds.length >= slots) {
      toast.error(`This deck has room for ${slots} more card${slots === 1 ? "" : "s"}.`);
      return;
    }
    setSelectedCardIds((current) => current.includes(cardId) ? current.filter((id) => id !== cardId) : [...current, cardId]);
  };
  const addSelectedCards = () => {
    if (!activeDeck || selectedCardIds.length === 0) return;
    const cardIds = selectedCardIds.filter((id) => !activeDeck.cardIds.includes(id));
    if (!cardIds.length) return setSelectedCardIds([]);
    const next = decks.map((deck) => deck.id === activeDeck.id ? { ...deck, cardIds: [...deck.cardIds, ...cardIds].slice(0, 12) } : deck);
    mutation.mutate(next, { onSuccess: () => { setSelectedCardIds([]); toast.success(`${cardIds.length} card${cardIds.length === 1 ? "" : "s"} added.`); } });
  };
  const removeCard = (cardId: string) => updateActive((deck) => ({ ...deck, cardIds: deck.cardIds.filter((id) => id !== cardId) }));
  const moveCard = (index: number, offset: number) => updateActive((deck) => { const cardIds = [...deck.cardIds]; const next = index + offset; if (next < 0 || next >= cardIds.length) return deck; [cardIds[index], cardIds[next]] = [cardIds[next], cardIds[index]]; return { ...deck, cardIds }; });
  const deleteDeck = () => { if (!activeDeck) return; const next = decks.filter((deck) => deck.id !== activeDeck.id); mutation.mutate(next, { onSuccess: (saved) => { queryClient.setQueryData(deckQueryKey, saved); setActiveId(saved[0]?.id ?? ""); setSelectedCardIds([]); toast.success("Deck deleted."); } }); };
  const renameDeck = () => { if (!activeDeck) return; const trimmed = name.trim(); if (!trimmed) return toast.error("Enter a deck name first."); persist(decks.map((deck) => deck.id === activeDeck.id ? { ...deck, name: trimmed.slice(0, 32) } : deck)); setName(""); };
  return (
    <div className="space-y-5 rounded-2xl border border-white/10 bg-black/20 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row">
        <input aria-label="New deck name" value={name} onChange={(event) => setName(event.target.value)} maxLength={32} placeholder="Name a deck" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none focus:border-cyan-300/60" />
        <button type="button" onClick={createDeck} disabled={mutation.isPending || decks.length >= 10} className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-300/30 bg-cyan-400/15 px-4 py-3 font-semibold text-cyan-100 disabled:opacity-50"><Plus className="size-4" />Create deck</button>
      </div>
      {deckQuery.isLoading && <p className="text-sm text-muted-foreground">Loading saved decks…</p>}
      {deckQuery.isError && <p className="text-sm text-rose-300">Could not load saved decks. Refresh and try again.</p>}
      <div className="flex flex-wrap items-center gap-2">
        {decks.map((deck) => <button type="button" key={deck.id} onClick={() => { setActiveId(deck.id); setName(""); setSelectedCardIds([]); }} className={`rounded-full border px-4 py-2 text-sm font-semibold ${activeDeck?.id === deck.id ? "border-cyan-300/50 bg-cyan-300/15 text-cyan-100" : "border-white/10 bg-white/5 text-white/70"}`}>{deck.name} <span className="ml-1 text-xs opacity-70">{deck.cardIds.length}/12</span></button>)}
      </div>
      {activeDeck ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <section className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-xs uppercase tracking-[0.16em] text-cyan-200/70">Deck order</p><h3 className="mt-1 text-lg font-bold">{activeDeck.name}</h3><p className="text-xs text-white/50">Move cards up or down to arrange them.</p></div>
              <button type="button" onClick={deleteDeck} disabled={mutation.isPending} aria-label="Delete selected deck" className="rounded-lg border border-rose-300/20 p-2 text-rose-200 hover:bg-rose-300/10 disabled:opacity-50"><Trash2 className="size-4" /></button>
            </div>
            <div className="flex gap-2"><input aria-label="Rename selected deck" value={name} onChange={(event) => setName(event.target.value)} maxLength={32} placeholder="Rename deck" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-cyan-300/60" /><button type="button" onClick={renameDeck} disabled={!name.trim() || mutation.isPending} className="rounded-lg border border-white/10 px-3 text-sm font-semibold disabled:opacity-40">Rename</button></div>
            <div className="space-y-2">
              {activeDeck.cardIds.map((cardId, index) => { const card = cardById.get(cardId); return <div key={cardId} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-2">{card?.media ? <img src={card.media} alt="" className="size-12 rounded-lg object-cover" loading="lazy" /> : <div className="grid size-12 place-items-center rounded-lg bg-white/5 text-xs">CARD</div>}<div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{card?.name ?? "Card no longer owned"}</p><p className="text-xs text-white/50">{card?.tier ?? "Unavailable"}</p></div><button type="button" onClick={() => moveCard(index, -1)} disabled={index === 0 || mutation.isPending} aria-label="Move card up" className="rounded-md border border-white/10 p-2 disabled:opacity-30"><ArrowUp className="size-4" /></button><button type="button" onClick={() => moveCard(index, 1)} disabled={index === activeDeck.cardIds.length - 1 || mutation.isPending} aria-label="Move card down" className="rounded-md border border-white/10 p-2 disabled:opacity-30"><ArrowDown className="size-4" /></button><button type="button" onClick={() => removeCard(cardId)} disabled={mutation.isPending} aria-label="Remove card from deck" className="rounded-md border border-white/10 p-2 text-rose-200 disabled:opacity-30"><Trash2 className="size-4" /></button></div>; })}
              {activeDeck.cardIds.length === 0 && <p className="rounded-lg border border-dashed border-white/10 p-4 text-sm text-white/50">Select one or more cards, then add them to this deck.</p>}
            </div>
          </section>
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3"><div><p className="text-xs uppercase tracking-[0.16em] text-cyan-200/70">Owned cards</p><p className="text-xs text-white/50">Up to 12 cards per deck.</p></div><button type="button" onClick={addSelectedCards} disabled={!selectedCardIds.length || mutation.isPending || !activeDeck || activeDeck.cardIds.length >= 12} className="inline-flex items-center gap-1 rounded-lg border border-cyan-300/30 bg-cyan-300/10 px-3 py-2 text-xs font-semibold text-cyan-100 disabled:opacity-40"><Plus className="size-3" />Add selected ({selectedCardIds.length})</button><input aria-label="Search owned cards" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search cards" className="w-40 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-cyan-300/60" /></div>
            <div className="grid max-h-[31rem] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
              {filteredCards.map((card) => { const inDeck = activeDeck.cardIds.includes(card.cardId); const selected = selectedCardIds.includes(card.cardId); return <button type="button" key={card.cardId} aria-pressed={selected} onClick={() => toggleCardSelection(card.cardId)} disabled={inDeck || mutation.isPending || activeDeck.cardIds.length >= 12} className={"overflow-hidden rounded-xl border text-left disabled:cursor-default disabled:opacity-50 " + (selected ? "border-cyan-300/70 bg-cyan-300/10" : "border-white/10 bg-black/20")}>{card.media ? <img src={card.media} alt="" loading="lazy" className="aspect-square w-full object-cover" /> : <div className="grid aspect-square place-items-center bg-white/5 text-xs text-white/40">CARD</div>}<span className="block truncate px-2 pt-2 text-xs font-semibold">{card.name}</span><span className="block px-2 pb-2 text-[10px] uppercase tracking-wider text-cyan-200/70">{inDeck ? "In deck" : selected ? "Selected" : card.tier}</span></button>; })}
              {filteredCards.length === 0 && <p className="col-span-full p-4 text-sm text-white/50">No cards match this search.</p>}
            </div>
          </section>
        </div>
      ) : <p className="rounded-xl border border-dashed border-white/10 p-5 text-sm text-white/50">Create a named deck to arrange your cards.</p>}
      <p className="min-h-5 text-xs text-cyan-100/70" aria-live="polite">{mutation.isPending ? "Saving your deck…" : selectedCardIds.length ? `${selectedCardIds.length} card${selectedCardIds.length === 1 ? "" : "s"} selected.` : "Changes save automatically."}</p>
    </div>
  );
}
