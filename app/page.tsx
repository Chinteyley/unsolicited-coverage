import { inboundAddress } from "@/lib/env";

export default function HomePage() {
  const desk = inboundAddress();

  return (
    <main className="page">
      <article className="memo">
        <p className="kicker">Mux × Resend · Best reply wins</p>
        <h1>Unsolicited Coverage</h1>
        <p className="deck">
          Someone emails a video URL. A tired studio reader — the automated kind
          — watches it once and replies with coverage. Logline, genre guess,
          comps, chapter reel, key moments, stamp. Not a summary. A verdict.
        </p>
        <div className="stamp" aria-hidden="true">
          CONSIDER
        </div>
        <dl>
          <div className="row">
            <dt>How</dt>
            <dd>
              Email a video URL to{" "}
              <a className="addr" href={`mailto:${desk}`}>
                {desk}
              </a>
              . Direct files preferred. Attachments count.
            </dd>
          </div>
          <div className="row">
            <dt>Then</dt>
            <dd>
              Resend inbound → Mux ingest → Robots (summarize, chapters, key
              moments) → a coverage memo in your thread.
            </dd>
          </div>
          <div className="row">
            <dt>Voice</dt>
            <dd>
              Exhausted. One screening. Unreasonably confident. Stamp is
              CONSIDER, PASS, or RECOMMEND.
            </dd>
          </div>
        </dl>
        <footer>
          No dashboard. The inbox is the UI.
          <br />
          Hackathon entry for Mux × Resend — Best reply wins.
        </footer>
      </article>
    </main>
  );
}
