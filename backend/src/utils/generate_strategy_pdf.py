from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Flowable,
    Table, TableStyle, HRFlowable,
)
from reportlab.lib.styles import ParagraphStyle
import sys, json, html

ACCENT       = colors.HexColor('#7c6cfc')
ACCENT_LIGHT = colors.HexColor('#e8e4ff')
TEXT_DARK    = colors.HexColor('#1a1a2e')
TEXT_GREY    = colors.HexColor('#6b6b8a')
BORDER       = colors.HexColor('#e8e8f0')
WHITE        = colors.white
PAGE_W, PAGE_H = A4
MARGIN = 20 * mm


def make_styles():
    return {
        'project_tag': ParagraphStyle('project_tag',
            fontName='Helvetica', fontSize=8,
            textColor=ACCENT, spaceAfter=2, leading=12),
        'doc_title': ParagraphStyle('doc_title',
            fontName='Helvetica-Bold', fontSize=22,
            textColor=TEXT_DARK, spaceAfter=4, leading=28),
        'doc_subtitle': ParagraphStyle('doc_subtitle',
            fontName='Helvetica', fontSize=11,
            textColor=TEXT_GREY, spaceAfter=0, leading=16),
    }


class AccentLine(Flowable):
    def __init__(self, width, thickness=2):
        Flowable.__init__(self)
        self.width = width
        self.thickness = thickness
        self.height = thickness + 8

    def draw(self):
        self.canv.setStrokeColor(ACCENT)
        self.canv.setLineWidth(self.thickness)
        self.canv.line(0, 4, self.width, 4)


def _safe(text: str) -> str:
    """Escape HTML special chars so Paragraph doesn't choke."""
    return html.escape(str(text))


def add_section_to_story(story, label: str, content: str, step_num: int, content_w: float):
    step_style = ParagraphStyle(
        'step_label',
        fontName='Helvetica-Bold', fontSize=7,
        textColor=ACCENT, spaceAfter=2, leading=10,
    )
    label_style = ParagraphStyle(
        'section_label',
        fontName='Helvetica-Bold', fontSize=9,
        textColor=TEXT_DARK, spaceAfter=2, leading=13,
    )
    content_style = ParagraphStyle(
        'section_content',
        fontName='Helvetica', fontSize=9,
        textColor=TEXT_DARK, leading=13, spaceAfter=1,
    )

    cell: list = [
        Paragraph(_safe(f'ШАГ {step_num}'), step_style),
        Paragraph(_safe(label.upper()), label_style),
        HRFlowable(width='100%', thickness=0.5, color=ACCENT_LIGHT,
                   spaceBefore=2, spaceAfter=6),
    ]

    for line in content.split('\n'):
        stripped = line.strip()
        if stripped:
            cell.append(Paragraph(_safe(stripped), content_style))
        else:
            cell.append(Spacer(1, 4))

    table = Table([[cell]], colWidths=[content_w])
    table.setStyle(TableStyle([
        ('BACKGROUND',    (0, 0), (-1, -1), WHITE),
        ('BOX',           (0, 0), (-1, -1), 0.5, BORDER),
        ('LINEBEFORE',    (0, 0), (0, -1),  3,   ACCENT),
        ('LEFTPADDING',   (0, 0), (-1, -1), 14),
        ('RIGHTPADDING',  (0, 0), (-1, -1), 12),
        ('TOPPADDING',    (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
        ('VALIGN',        (0, 0), (-1, -1), 'TOP'),
    ]))

    story.append(table)
    story.append(Spacer(1, 3 * mm))


def on_first_page(canvas_obj, doc, project_name, date_str):
    W, H = A4
    canvas_obj.setFillColor(ACCENT)
    canvas_obj.rect(0, H - 8*mm, W, 8*mm, fill=1, stroke=0)
    canvas_obj.setFillColor(WHITE)
    canvas_obj.setFont('Helvetica-Bold', 11)
    canvas_obj.drawString(MARGIN, H - 5.5*mm, 'PSY Boost')
    canvas_obj.setFont('Helvetica', 8)
    canvas_obj.drawRightString(W - MARGIN, H - 5.5*mm, date_str)
    canvas_obj.setFillColor(ACCENT)
    canvas_obj.rect(0, 0, W, 6*mm, fill=1, stroke=0)
    canvas_obj.setFillColor(WHITE)
    canvas_obj.setFont('Helvetica', 7.5)
    canvas_obj.drawString(MARGIN, 2*mm, f'Стратегия · {project_name}')
    canvas_obj.drawRightString(W - MARGIN, 2*mm, 'psyboost.ru')


def on_later_pages(canvas_obj, doc, project_name, date_str):
    W, H = A4
    canvas_obj.setFillColor(ACCENT)
    canvas_obj.rect(0, H - 6*mm, W, 6*mm, fill=1, stroke=0)
    canvas_obj.setFillColor(WHITE)
    canvas_obj.setFont('Helvetica-Bold', 9)
    canvas_obj.drawString(MARGIN, H - 4*mm, 'PSY Boost')
    canvas_obj.setFont('Helvetica', 8)
    canvas_obj.drawRightString(W - MARGIN, H - 4*mm,
        f'{project_name} · стр. {doc.page}')
    canvas_obj.setFillColor(ACCENT)
    canvas_obj.rect(0, 0, W, 5*mm, fill=1, stroke=0)
    canvas_obj.setFillColor(WHITE)
    canvas_obj.setFont('Helvetica', 7)
    canvas_obj.drawString(MARGIN, 1.5*mm, 'Создано в PSY Boost')
    canvas_obj.drawRightString(W - MARGIN, 1.5*mm, 'psyboost.ru')


def generate_strategy_pdf(output_path: str, project_name: str, answers: dict):
    from datetime import datetime
    date_str = datetime.now().strftime('%d.%m.%Y')
    styles   = make_styles()
    content_w = PAGE_W - 2 * MARGIN
    story: list = []

    story.append(Spacer(1, 8 * mm))
    story.append(Paragraph('МАРКЕТИНГОВАЯ СТРАТЕГИЯ', styles['project_tag']))
    story.append(Paragraph(_safe(project_name), styles['doc_title']))
    story.append(Paragraph(
        f'Стратегия упаковки по JTBD-фреймворку · Создана {date_str}',
        styles['doc_subtitle']))
    story.append(Spacer(1, 4 * mm))
    story.append(AccentLine(content_w))
    story.append(Spacer(1, 6 * mm))

    sections = [
        (1,  '10 сегментов ЦА',                      answers.get('segments',        '—')),
        (2,  'ТОП 3 сегмента',                        answers.get('top3segments',    '—')),
        (3,  'Выбранный сегмент',                     answers.get('chosenSegment',   '—')),
        (4,  '5 подсегментов',                        answers.get('subsegments',     '—')),
        (5,  'Выбранный подсегмент',                  answers.get('chosenSubsegment','—')),
        (6,  'Список "ХОЧУ"',                         answers.get('wants',           '—')),
        (7,  '10 запросов сегмента',                  answers.get('requests',        '—')),
        (8,  'Выбранный запрос',                      answers.get('chosenRequest',   '—')),
        (9,  'Болезненные вопросы',                   answers.get('painfulQuestions','—')),
        (10, 'Сокровенные желания',                   answers.get('deepDesires',     '—')),
        (11, 'Конечный результат + что бесит больше', (
            answers.get('finalResult', '—') + '\n\n' +
            answers.get('corePains', '—')
        )),
    ]

    for step_num, label, content in sections:
        add_section_to_story(story, label, content, step_num, content_w)

    doc = SimpleDocTemplate(
        output_path, pagesize=A4,
        leftMargin=MARGIN, rightMargin=MARGIN,
        topMargin=14 * mm, bottomMargin=12 * mm,
        title=f'Стратегия · {project_name}',
        author='PSY Boost',
    )
    doc.build(
        story,
        onFirstPage=lambda c, d: on_first_page(c, d, project_name, date_str),
        onLaterPages=lambda c, d: on_later_pages(c, d, project_name, date_str),
    )


if __name__ == '__main__':
    data = json.loads(sys.argv[1])
    generate_strategy_pdf(
        data['outputPath'],
        data['projectName'],
        data['answers'],
    )
