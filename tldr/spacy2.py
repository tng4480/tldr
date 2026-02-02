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
This is your time to shine in the era of AI! We are looking for amazing, creative, and purposeful individuals to join our team of world-class, highly motivated software engineers, cloud computing experts and AI visionaries during our 12-week internship program. From Agentforce, Marketing, Data, and Commerce Cloud, to Infrastructure and Security, to MuleSoft, Tableau, Slack, and everything in between, we have many opportunities available across various applications and platforms all infused with the power of artificial intelligence.

Join Salesforce and define the future of Customer Relationship Management Solutions with a strong emphasis on AI-driven innovation. We deliver a scalable, high-performance cloud computing platform that not only empowers our customers but is also enhanced by AI to provide intelligent insights and automation used by millions of people around the world each day for their businesses. You will be working with a group of world-class engineers to build breakthrough features that our customers will love. The software engineering intern role will give you hands-on experience with architecture, design, implementation, and testing as you ensure we build products customers trust and love.

Salesforce is the global leader in Customer Relationship Management (CRM). Companies of every size and industry are using Salesforce to transform their businesses, across sales, service, marketing, commerce, and more by connecting with customers in a whole new way. We harness technologies that can revolutionize companies, careers, and, hopefully, our world.
"""

    spans = get_highlight_spans(text)
    render_pdf(text, spans, "highlighted.pdf")

    print("PDF written to highlighted.pdf")
