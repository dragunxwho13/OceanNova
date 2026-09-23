#!/usr/bin/env python3
"""Generate the OCEANNOVA flood-aware route intelligence solution PDF."""

from pathlib import Path
import sys

try:
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_CENTER, TA_LEFT
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import cm
    from reportlab.pdfgen import canvas
    from reportlab.platypus import ListFlowable, ListItem, Paragraph, Preformatted, SimpleDocTemplate, Spacer
except ImportError as exc:
    raise SystemExit(
        "Missing dependency: reportlab. Install with `python -m pip install reportlab`."
    ) from exc


PROBLEM_STATEMENT = "How can people know which roads are usable when a flood cuts off a neighbourhood?"


def _page_number(c: canvas.Canvas, _doc: SimpleDocTemplate) -> None:
    c.setFont("Helvetica", 9)
    c.setFillColor(colors.HexColor("#475569"))
    c.drawRightString(A4[0] - 2 * cm, 1.25 * cm, f"Page {c.getPageNumber()}")


def build_pdf(output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)

    doc = SimpleDocTemplate(
        str(output_path),
        pagesize=A4,
        rightMargin=2.2 * cm,
        leftMargin=2.2 * cm,
        topMargin=2.1 * cm,
        bottomMargin=2.2 * cm,
        title="OCEANNOVA — AI-Powered Flood-Aware Route Intelligence",
        author="OCEANNOVA Team",
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "Title",
        parent=styles["Title"],
        fontName="Helvetica-Bold",
        fontSize=22,
        leading=26,
        textColor=colors.HexColor("#0F172A"),
        alignment=TA_CENTER,
        spaceAfter=12,
    )
    subtitle_style = ParagraphStyle(
        "Subtitle",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=11,
        leading=14,
        textColor=colors.HexColor("#1D4ED8"),
        alignment=TA_CENTER,
        spaceAfter=12,
    )
    heading_style = ParagraphStyle(
        "Heading",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=13,
        leading=16,
        textColor=colors.HexColor("#0B3A6E"),
        spaceBefore=7,
        spaceAfter=4,
    )
    body_style = ParagraphStyle(
        "Body",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=10.4,
        leading=14,
        textColor=colors.HexColor("#0F172A"),
        alignment=TA_LEFT,
        spaceAfter=6,
    )
    emphasis_style = ParagraphStyle(
        "Emphasis",
        parent=body_style,
        textColor=colors.HexColor("#1E3A8A"),
    )
    mono_style = ParagraphStyle(
        "Mono",
        parent=body_style,
        fontName="Courier",
        fontSize=9.4,
        leading=12,
        textColor=colors.HexColor("#0F172A"),
        leftIndent=8,
        backColor=colors.HexColor("#EFF6FF"),
        borderPadding=7,
    )

    story = [
        Paragraph("OCEANNOVA — AI-Powered Flood-Aware Route Intelligence", title_style),
        Paragraph("Selected Sector: <b>Disaster Resilience</b>", subtitle_style),
        Paragraph(
            f"<b>Selected Problem Statement:</b> \"{PROBLEM_STATEMENT}\"",
            emphasis_style,
        ),
        Spacer(1, 8),
        Paragraph("1) Problem Context", heading_style),
        Paragraph(
            "Flood events can change road conditions in minutes: sections may become submerged, impassable, debris-covered, or unsafe for emergency vehicles. "
            "Static maps and delayed reports are often insufficient, so residents, emergency responders, and relief teams may not know which roads are currently usable.",
            body_style,
        ),
        Paragraph("2) Proposed OCEANNOVA Solution", heading_style),
        Paragraph(
            "OCEANNOVA currently detects and explains ocean/coastal environmental anomalies using AI over satellite imagery, hyperspectral/ocean-colour signals, and geospatial context. "
            "For flood response, this capability can be extended into a flood-routing intelligence workflow that fuses flood-related anomaly indicators with road-network data.",
            body_style,
        ),
        Paragraph(
            "<b>Current platform strengths (implemented):</b> anomaly detection, confidence scoring, evidence-backed explainability, and reviewable geospatial outputs.",
            body_style,
        ),
        Paragraph(
            "<b>Proposed extension (not yet fully implemented in repository):</b> classify road segments by likely usability state (usable / caution / likely blocked), with confidence-ranked evidence and human verification workflows before field action.",
            body_style,
        ),
        Paragraph("3) Intended Users", heading_style),
    ]

    users = [
        "Residents and neighbourhood communities",
        "Emergency services (fire, medical, police)",
        "Local governments and disaster-response organizations",
        "NGOs and humanitarian teams",
        "Public-works and infrastructure operations teams",
        "Coastal communities exposed to recurrent flooding",
    ]
    story.append(
        ListFlowable(
            [ListItem(Paragraph(user, body_style)) for user in users],
            bulletType="bullet",
            start="circle",
            leftIndent=16,
        )
    )

    story.extend(
        [
            Paragraph("4) Practical Workflow / Architecture", heading_style),
            Paragraph(
                "Data and inference flow for flood-aware route intelligence:",
                body_style,
            ),
            Preformatted(
                """
Satellite + Geospatial Inputs
  (optical/SAR imagery, ocean-colour anomalies, terrain, rainfall, road graph)
            ↓
Anomaly & Flood Signal Detection
  (water extent, turbidity/runoff cues, flood-likelihood indicators)
            ↓
Confidence + Evidence Layer
  (model confidence, evidence bands/features, uncertainty flags)
            ↓
Road Usability Classification
  (segment status: usable / caution / likely blocked)
            ↓
Reviewable Map + Alerts
  (operator dashboard, API feeds, triage queues, auditable decisions)
""".strip("\n"),
                mono_style,
            ),
            Paragraph("5) Social Impact", heading_style),
        ]
    )

    impact_points = [
        "Faster evacuation routing and aid delivery in rapidly changing flood conditions",
        "Reduced exposure to unsafe roads for residents and responders",
        "Better prioritization of scarce field-verification resources",
        "Improved cross-agency situational awareness through shared evidence",
        "Stronger long-term resilience in flood-prone and coastal communities",
    ]
    story.append(
        ListFlowable(
            [ListItem(Paragraph(point, body_style)) for point in impact_points],
            bulletType="bullet",
            leftIndent=16,
        )
    )

    story.extend(
        [
            Paragraph("6) Limitations & Responsible Use", heading_style),
            Paragraph(
                "This solution must be used as decision support, not as an autonomous safety guarantee. Key constraints include satellite revisit intervals, cloud cover/atmospheric obstruction, ingestion latency, and model uncertainty.",
                body_style,
            ),
            Paragraph(
                "All route-status outputs should be accompanied by confidence levels and uncertainty markers, and must be validated by local authorities, on-ground teams, and emergency command channels before operational decisions.",
                body_style,
            ),
            Paragraph(
                "<b>Critical note:</b> A model indication does <b>not</b> guarantee a road is safe. Final authority remains with emergency management officials and verified field observations.",
                body_style,
            ),
            Paragraph("7) Implementation Roadmap (Concise)", heading_style),
        ]
    )

    roadmap = [
        "Phase 1 (0-2 months): Integrate flood-relevant imagery feeds and road-network layers; define route-status taxonomy and confidence schema.",
        "Phase 2 (2-4 months): Train/calibrate flood and road-status models with historical events; implement explainable evidence outputs.",
        "Phase 3 (4-6 months): Pilot with local emergency/public-works partners; add operator review queue and alert thresholds.",
        "Phase 4 (6+ months): Expand geography, improve latency, and formalize governance, auditing, and responder training.",
    ]
    story.append(
        ListFlowable(
            [ListItem(Paragraph(item, body_style)) for item in roadmap],
            bulletType="1",
            leftIndent=18,
        )
    )

    story.extend(
        [
            Paragraph("8) Success Metrics", heading_style),
        ]
    )

    metrics = [
        "Median time to publish updated route-status map after major rainfall/flood signal",
        "Precision/recall of 'likely blocked' classification against validated field reports",
        "Reduction in responder route re-planning incidents due to unexpected road closure",
        "Percentage of high-priority alerts resolved with confirmation workflow",
        "Stakeholder trust indicators: usability, clarity of evidence, and actionability scores",
    ]
    story.append(
        ListFlowable(
            [ListItem(Paragraph(item, body_style)) for item in metrics],
            bulletType="bullet",
            leftIndent=16,
        )
    )

    story.append(Spacer(1, 8))
    story.append(
        Paragraph(
            "Prepared for program/competition submission using OCEANNOVA project context and transparent capability boundaries.",
            ParagraphStyle(
                "FooterNote",
                parent=body_style,
                fontSize=9,
                textColor=colors.HexColor("#334155"),
                alignment=TA_CENTER,
            ),
        )
    )

    doc.build(story, onFirstPage=_page_number, onLaterPages=_page_number)


if __name__ == "__main__":
    repo_root = Path(__file__).resolve().parents[1]
    out = repo_root / "docs" / "OCEANNOVA_Flood_Aware_Route_Intelligence.pdf"
    build_pdf(out)
    print(f"Generated: {out}")
