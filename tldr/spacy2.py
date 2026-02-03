import spacy
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm

# =========================
# Load spaCy model
# =========================
# Make sure this is installed:
# C:/Python313/python.exe -m spacy download en_core_web_sm
nlp = spacy.load("en_core_web_md")


# =========================
# Highlight extraction
# =========================
def get_highlight_spans(text: str):
    """
    Returns a sorted list of (start, end) character spans
    that should be highlighted.
    """
    doc = nlp(text)
    spans = []

    # Noun chunks (spaCy-style)
    for chunk in doc.noun_chunks:
        if not chunk.root.is_stop and len(chunk.text.strip()) > 2:
            spans.append((chunk.start_char, chunk.end_char))

    # Standalone PROPN / ADJ tokens
    for token in doc:
        if token.pos_ in ("PROPN", "ADJ") and not token.is_stop:
            spans.append((token.idx, token.idx + len(token.text)))

    # Deduplicate + sort
    spans = list(set(spans))
    spans.sort()

    return spans


# =========================
# PDF rendering
# =========================
def render_pdf(text: str, spans, output_path="highlighted.pdf"):
    c = canvas.Canvas(output_path, pagesize=A4)
    width, height = A4

    margin_x = 20 * mm
    margin_y = 20 * mm

    x = margin_x
    y = height - margin_y

    normal_font = "Helvetica"
    highlight_font = "Helvetica-Bold"

    normal_size = 10
    highlight_size = 15
    line_height = 18

    spans = spans.copy()

    i = 0
    while i < len(text):
        # Check if current index starts a highlighted span
        span = next((s for s in spans if s[0] == i), None)

        if span:
            _, end = span
            chunk = text[i:end]

            c.setFont(highlight_font, highlight_size)
            c.drawString(x, y, chunk)

            x += c.stringWidth(chunk, highlight_font, highlight_size)
            i = end
        else:
            char = text[i]

            c.setFont(normal_font, normal_size)
            c.drawString(x, y, char)

            x += c.stringWidth(char, normal_font, normal_size)
            i += 1

        # Line wrapping
        if x > width - margin_x:
            x = margin_x
            y -= line_height

        # Page break
        if y < margin_y:
            c.showPage()
            x = margin_x
            y = height - margin_y

    c.save()


# =========================
# Example usage
# =========================
if __name__ == "__main__":
    text = """
Been building brandled with AI and basically zero technical background. Everyone talks about how easy it is now with Claude Code, Antigravity etc.., but they leave out the part where you get completely fucked by production issues that AI can't solve.

Pure AI coding gets you maybe 60% there. You can build nice landing pages, set up login systems, even get a decent dashboard running. But then real subscribers start using your product and everything breaks in ways the AI never warned you about.

Lemonsqueezy integration that worked perfectly in test mode but randomly failed with real customers. I thought I was making money while actual payments were bouncing. AI couldn't explain webhook validation or why certain cards were getting declined without proper error handling.

Database performance that was fine with 10 users but completely shit with 1,000+. Every query started timing out. AI kept suggesting caching fixes instead of telling me I was running garbage queries on unindexed tables. My dashboard was loading every single data point instead of paginating like a normal human would.

User sessions that just randomly logged people out. What happens when someone's subscription expires while they're using the app? How do you handle multiple browser tabs? AI could fix individual bugs but had no clue how to build proper session management.

Data isolation problems where customers could see each other's data. That's a fun support ticket to get. AI had zero understanding of how to debug multi-tenant architecture or why my database setup was fundamentally broken.

Billing logic that looked perfect but created accounting chaos. Proration, failed payment retries, subscription changes - the AI code "worked" but had edge cases that destroyed my revenue tracking. One customer downgrading somehow triggered three billing events and I couldn't figure out what the hell happened.

The turning point was realizing I needed to be a better AI supervisor, not just blindly trust whatever code it spat out. Started setting up actual logging for critical actions, testing payment flows with real cards before launching, keeping a simple spreadsheet of what actually worked vs what looked good in dev.
"""

    spans = get_highlight_spans(text)
    render_pdf(text, spans, "highlighted.pdf")

    print("PDF written to highlighted.pdf")
