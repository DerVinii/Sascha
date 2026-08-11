import { listListsAction, listLeadTagsAction } from "./scraping/actions";
import { FolderGrid } from "./_components/folder-grid";

export const dynamic = "force-dynamic";

export default async function VertriebPage() {
  const [lists, tags] = await Promise.all([
    listListsAction(),
    listLeadTagsAction(),
  ]);

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl">
      <div>
        <h2 className="text-base font-semibold text-ink">Kampagnen</h2>
        <p className="text-xs text-sub mt-0.5">
          Deine Kampagnen. Erstelle eine Kampagne, füll sie per Scrapen,
          CSV-Import oder manuell, reichere die Leads an — und richte dann den
          Mailversand ein.
        </p>
      </div>

      <FolderGrid lists={lists} tags={tags} />
    </div>
  );
}
