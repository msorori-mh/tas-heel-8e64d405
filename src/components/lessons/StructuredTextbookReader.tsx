import { BookOpen, ClipboardList, ListChecks, Sparkles } from "lucide-react";
import {
  PILOT_20A1B_ASSET_MAP,
  type StructuredBlock,
  type StructuredDocument,
} from "@/lib/content/official-textbook/structured-blocks";
import { cn } from "@/lib/utils";

/**
 * TAMKEEN_STRUCTURED_TEXTBOOK_READER_PILOT_20A1B
 *
 * Student-facing reader for approved Official Textbook structured content.
 * Renders blocks in their approved order, verbatim. No summarizing,
 * no reordering, no dropped blocks, no dangerouslySetInnerHTML.
 */

interface Props {
  document: StructuredDocument;
  assetMap?: Record<string, string>;
  className?: string;
}

const ASSESSMENT_HEADINGS = new Set(["التقويم"]);

function Paragraphs({ items }: { items: string[] }) {
  return (
    <>
      {items.map((text, i) => (
        <p key={i} className="mb-3 text-[15px] leading-[2.1] text-card-foreground last:mb-0">
          {text}
        </p>
      ))}
    </>
  );
}

function QuranBlock({ block }: { block: StructuredBlock }) {
  return (
    <div className="my-5 rounded-2xl border border-primary/30 bg-primary/[0.06] px-4 py-5 sm:px-6">
      {block.ayahs.map((ayah, i) => (
        <p
          key={i}
          className="whitespace-pre-line text-center text-[19px] font-medium leading-[2.5] text-foreground sm:text-[21px]"
        >
          {ayah.text_exact}
        </p>
      ))}
      {block.notes && (
        <p className="mt-3 text-center text-[11px] text-muted-foreground">
          {block.notes.split("|")[0]?.trim()}
        </p>
      )}
    </div>
  );
}

function VerseMeanings({ items }: { items: string[] }) {
  return (
    <dl className="my-4 space-y-3">
      {items.map((item, i) => {
        const idx = item.indexOf(" : ");
        const term = idx > 0 ? item.slice(0, idx) : null;
        const meaning = idx > 0 ? item.slice(idx + 3) : item;
        return (
          <div
            key={i}
            className="rounded-xl border-r-4 border-primary/40 bg-muted/40 px-3 py-2.5 sm:px-4"
          >
            {term && (
              <dt className="mb-1 text-[15px] font-bold leading-[2] text-foreground">{term} :</dt>
            )}
            <dd className="text-[15px] leading-[2.1] text-card-foreground">{meaning}</dd>
          </div>
        );
      })}
    </dl>
  );
}

function FigureBlock({
  block,
  assetMap,
}: {
  block: StructuredBlock;
  assetMap: Record<string, string>;
}) {
  return (
    <figure className="my-5 text-center">
      <div className="flex flex-col items-center gap-3">
        {block.figure_asset_paths.map((path) => {
          const src = assetMap[path];
          if (!src) return null;
          return (
            <img
              key={path}
              src={src}
              alt={block.figure_description_only ?? "صورة من الكتاب الرسمي"}
              loading="lazy"
              className="mx-auto h-auto w-full max-w-full rounded-xl border border-border bg-background"
            />
          );
        })}
      </div>
      {block.figure_description_only && (
        <figcaption className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
          {block.figure_description_only}
        </figcaption>
      )}
    </figure>
  );
}

function ActivityBlock({ block }: { block: StructuredBlock }) {
  return (
    <section className="my-6 rounded-2xl border border-accent/40 bg-accent/[0.07] px-4 py-4 sm:px-5">
      <h3 className="mb-2 flex items-center gap-2 text-[15px] font-bold text-foreground">
        <Sparkles className="h-4 w-4 text-accent" aria-hidden />
        {block.heading_exact ?? "نشاط"}
      </h3>
      <Paragraphs items={block.paragraphs_exact} />
      {block.items_exact.length > 0 && (
        <ul className="mt-2 list-disc space-y-1.5 pr-5 text-[15px] leading-[2] text-card-foreground">
          {block.items_exact.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AssessmentBlock({ block }: { block: StructuredBlock }) {
  return (
    <section className="my-6 rounded-2xl border border-border bg-muted/30 px-4 py-4 sm:px-5">
      <h3 className="mb-3 flex items-center gap-2 text-[15px] font-bold text-foreground">
        <ClipboardList className="h-4 w-4 text-primary" aria-hidden />
        أسئلة التقويم
      </h3>
      <ol className="space-y-4">
        {block.questions.map((q, i) => (
          <li key={i} className="flex gap-2">
            <span className="shrink-0 rounded-lg bg-primary/10 px-2 py-0.5 text-[13px] font-bold text-primary">
              {q.number_label}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] leading-[2.1] text-card-foreground">{q.text_exact}</p>
              {q.sub_items_exact.length > 0 && (
                <ul className="mt-1.5 space-y-1.5 pr-1">
                  {q.sub_items_exact.map((s, j) => (
                    <li key={j} className="text-[14.5px] leading-[2] text-card-foreground">
                      {s}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ObjectivesBlock({ block }: { block: StructuredBlock }) {
  return (
    <section className="my-5 rounded-2xl border border-primary/25 bg-primary/[0.05] px-4 py-4 sm:px-5">
      <h3 className="mb-2 flex items-center gap-2 text-[15px] font-bold text-foreground">
        <ListChecks className="h-4 w-4 text-primary" aria-hidden />
        {block.heading_exact ?? "الأهداف"}
      </h3>
      <Paragraphs items={block.paragraphs_exact} />
      <ul className="mt-1 list-disc space-y-1.5 pr-5 text-[15px] leading-[2] text-card-foreground">
        {block.items_exact.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </section>
  );
}

function renderBlock(block: StructuredBlock, assetMap: Record<string, string>) {
  switch (block.type) {
    case "lesson_header":
      return (
        <header className="mb-4 border-b border-border pb-3">
          <h2 className="text-[17px] font-extrabold leading-[1.9] text-foreground sm:text-[19px]">
            {block.heading_exact}
          </h2>
        </header>
      );
    case "heading":
      return (
        <h2
          className={cn(
            "mt-7 mb-2 text-[16px] font-bold leading-[2] text-foreground first:mt-0 sm:text-[17px]",
            ASSESSMENT_HEADINGS.has((block.heading_exact ?? "").trim()) &&
              "mt-8 border-t border-border pt-5",
          )}
        >
          {block.heading_exact}
        </h2>
      );
    case "objectives":
      return <ObjectivesBlock block={block} />;
    case "paragraph":
      return <Paragraphs items={block.paragraphs_exact} />;
    case "list":
      return (
        <ul className="mb-4 list-disc space-y-1.5 pr-5 text-[15px] leading-[2] text-card-foreground">
          {block.items_exact.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ul>
      );
    case "quran_verses":
      return <QuranBlock block={block} />;
    case "verse_meaning":
      return <VerseMeanings items={block.items_exact} />;
    case "figure":
      return <FigureBlock block={block} assetMap={assetMap} />;
    case "official_activity":
      return <ActivityBlock block={block} />;
    case "official_textbook_assessment":
      return <AssessmentBlock block={block} />;
    default:
      return (
        <>
          {block.heading_exact && (
            <h3 className="mt-4 mb-2 text-[15px] font-bold text-foreground">
              {block.heading_exact}
            </h3>
          )}
          <Paragraphs items={block.paragraphs_exact} />
        </>
      );
  }
}

export function StructuredTextbookReader({
  document: doc,
  assetMap = PILOT_20A1B_ASSET_MAP,
  className,
}: Props) {
  return (
    <article
      dir="rtl"
      lang="ar"
      className={cn(
        "mx-auto w-full max-w-[860px] overflow-x-hidden px-[14px] text-right sm:px-6",
        className,
      )}
    >
      <header className="mb-4 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
          <BookOpen className="h-3.5 w-3.5" aria-hidden />
          محتوى الكتاب الرسمي
        </span>
        <span className="text-[11px] text-muted-foreground">
          نص الكتاب الوزاري كما هو — بدون تلخيص أو تعديل
        </span>
      </header>

      {doc.blocks.map((block) => (
        <div key={block.block_id} data-block-id={block.block_id} data-block-type={block.type}>
          {renderBlock(block, assetMap)}
        </div>
      ))}
    </article>
  );
}

export default StructuredTextbookReader;
