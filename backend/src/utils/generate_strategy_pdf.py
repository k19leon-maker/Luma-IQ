from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Flowable,
    Table, TableStyle, HRFlowable, KeepTogether,
)
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import sys, json, html, os, re

ACCENT       = colors.HexColor('#D8AB3F')
ACCENT_LIGHT = colors.HexColor('#F5E7C4')
TEXT_DARK    = colors.HexColor('#262626')
TEXT_GREY    = colors.HexColor('#77736C')
BORDER       = colors.HexColor('#E7DFD1')
SOFT_BG      = colors.HexColor('#FCFAF6')
WHITE        = colors.white
PAGE_W, PAGE_H = A4
MARGIN = 20 * mm
INNER_W = PAGE_W - 2 * MARGIN


def register_fonts():
    candidates = [
        ('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
         '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'),
        ('/usr/local/share/fonts/DejaVuSans.ttf',
         '/usr/local/share/fonts/DejaVuSans-Bold.ttf'),
        ('/Library/Fonts/Arial Unicode.ttf',
         '/Library/Fonts/Arial Unicode.ttf'),
    ]
    for regular, bold in candidates:
        if os.path.exists(regular) and os.path.exists(bold):
            pdfmetrics.registerFont(TTFont('LumaSans', regular))
            pdfmetrics.registerFont(TTFont('LumaSans-Bold', bold))
            return 'LumaSans', 'LumaSans-Bold'
    return 'Helvetica', 'Helvetica-Bold'


FONT_REGULAR, FONT_BOLD = register_fonts()


def make_styles():
    return {
        'project_tag': ParagraphStyle('project_tag',
            fontName=FONT_BOLD, fontSize=8.5,
            textColor=ACCENT, spaceAfter=3, leading=12),
        'doc_title': ParagraphStyle('doc_title',
            fontName=FONT_BOLD, fontSize=23,
            textColor=TEXT_DARK, spaceAfter=4, leading=28),
        'doc_subtitle': ParagraphStyle('doc_subtitle',
            fontName=FONT_REGULAR, fontSize=10.5,
            textColor=TEXT_GREY, spaceAfter=0, leading=16),
        'step_label': ParagraphStyle('step_label',
            fontName=FONT_BOLD, fontSize=7.5,
            textColor=ACCENT, spaceAfter=3, leading=10,
            keepWithNext=True),
        'section_label': ParagraphStyle('section_label',
            fontName=FONT_BOLD, fontSize=15,
            textColor=TEXT_DARK, spaceAfter=2, leading=19,
            keepWithNext=True),
        'section_intro': ParagraphStyle('section_intro',
            fontName=FONT_REGULAR, fontSize=9.4,
            textColor=TEXT_GREY, leading=14, spaceAfter=4),
        'segment_title': ParagraphStyle('segment_title',
            fontName=FONT_BOLD, fontSize=11.4,
            textColor=TEXT_DARK, leading=16, spaceAfter=5,
            keepWithNext=True),
        'subheading': ParagraphStyle('subheading',
            fontName=FONT_BOLD, fontSize=10.8,
            textColor=TEXT_DARK, leading=15, spaceBefore=4, spaceAfter=4,
            keepWithNext=True),
        'body': ParagraphStyle('body',
            fontName=FONT_REGULAR, fontSize=9.5,
            textColor=TEXT_DARK, leading=14.2, spaceAfter=3),
        'body_small': ParagraphStyle('body_small',
            fontName=FONT_REGULAR, fontSize=9.0,
            textColor=TEXT_DARK, leading=13.5, spaceAfter=3),
        'bullet': ParagraphStyle('bullet',
            fontName=FONT_REGULAR, fontSize=9.3,
            textColor=TEXT_DARK, leading=13.8, leftIndent=9, firstLineIndent=-7, spaceAfter=2),
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


def _inline(text: str) -> str:
    escaped = _safe(text)
    escaped = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', escaped)
    return escaped


def _line_flowable(line: str, styles):
    stripped = line.strip()
    if not stripped:
        return Spacer(1, 2.4 * mm)

    cleaned = stripped.replace('###', '').replace('##', '').strip()
    segment_match = re.match(r'^(Сегмент\s+\d+)\s*[—-]\s*(.+)$', cleaned, flags=re.I)
    if segment_match:
        return Paragraph(
            f'{_safe(segment_match.group(1))} — <b>{_inline(segment_match.group(2))}</b>',
            styles['segment_title'],
        )

    if stripped.startswith('###') or stripped.startswith('##'):
        return Paragraph(_inline(cleaned), styles['subheading'])

    if re.match(r'^[-•]\s+', stripped):
        text = re.sub(r'^[-•]\s+', '', stripped)
        return Paragraph(f'• {_inline(text)}', styles['bullet'])

    label_match = re.match(
        r'^(Когда|Хочу|Чтобы|Кто|Где|Почему|Как|Запрос|Боль|Страх|Желание|Возражение|Инсайт|Сегмент|Подсегмент):\s*(.+)$',
        stripped,
        flags=re.I,
    )
    if label_match:
        return Paragraph(
            f'<b>{_safe(label_match.group(1))}:</b> {_inline(label_match.group(2))}',
            styles['body'],
        )

    if ':' in stripped and len(stripped.split(':', 1)[0]) <= 34:
        label, rest = stripped.split(':', 1)
        return Paragraph(f'<b>{_safe(label.strip())}:</b> {_inline(rest.strip())}', styles['body'])

    return Paragraph(_inline(stripped), styles['body'])


def _group_content_lines(content: str):
    lines = [line.rstrip() for line in str(content).split('\n')]
    groups = []
    current = []
    for line in lines:
        starts_segment = bool(re.match(r'^\s*(?:#{2,3}\s*)?Сегмент\s+\d+\s*[—-]', line, flags=re.I))
        starts_heading = line.lstrip().startswith(('## ', '### '))
        if current and (starts_segment or starts_heading):
            groups.append(current)
            current = []
        current.append(line)
    if current:
        groups.append(current)
    return groups


def _card(flowables, content_w: float):
    table = Table([[flowables]], colWidths=[content_w])
    table.setStyle(TableStyle([
        ('BACKGROUND',    (0, 0), (-1, -1), WHITE),
        ('BOX',           (0, 0), (-1, -1), 0.45, BORDER),
        ('LEFTPADDING',   (0, 0), (-1, -1), 10),
        ('RIGHTPADDING',  (0, 0), (-1, -1), 10),
        ('TOPPADDING',    (0, 0), (-1, -1), 7),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
        ('VALIGN',        (0, 0), (-1, -1), 'TOP'),
    ]))
    return table


def add_section_to_story(story, label: str, content: str, step_num: int, content_w: float):
    styles = make_styles()
    header = [
        Paragraph(_safe(f'ШАГ {step_num}'), styles['step_label']),
        Paragraph(_safe(label), styles['section_label']),
        HRFlowable(width='100%', thickness=0.7, color=ACCENT_LIGHT,
                   spaceBefore=1, spaceAfter=5),
    ]
    story.append(KeepTogether(header))

    groups = _group_content_lines(content or '—')
    for group in groups:
        flowables = [_line_flowable(line, styles) for line in group]
        non_empty_count = len([line for line in group if line.strip()])
        if non_empty_count <= 4:
            story.append(KeepTogether([_card(flowables, content_w)]))
        else:
            story.append(_card(flowables, content_w))
        story.append(Spacer(1, 2.4 * mm))

    story.append(Spacer(1, 2 * mm))


def on_first_page(canvas_obj, doc, project_name, date_str):
    W, H = A4
    canvas_obj.setFillColor(ACCENT)
    canvas_obj.rect(0, H - 8*mm, W, 8*mm, fill=1, stroke=0)
    canvas_obj.setFillColor(WHITE)
    canvas_obj.setFont(FONT_BOLD, 11)
    canvas_obj.drawString(MARGIN, H - 5.5*mm, 'LumaIQ')
    canvas_obj.setFont(FONT_REGULAR, 8)
    canvas_obj.drawRightString(W - MARGIN, H - 5.5*mm, date_str)
    canvas_obj.setFillColor(ACCENT)
    canvas_obj.rect(0, 0, W, 6*mm, fill=1, stroke=0)
    canvas_obj.setFillColor(WHITE)
    canvas_obj.setFont(FONT_REGULAR, 7.5)
    canvas_obj.drawString(MARGIN, 2*mm, f'Стратегия · {project_name}')
    canvas_obj.drawRightString(W - MARGIN, 2*mm, 'lumaiq.ru')


def on_later_pages(canvas_obj, doc, project_name, date_str):
    W, H = A4
    canvas_obj.setFillColor(ACCENT)
    canvas_obj.rect(0, H - 6*mm, W, 6*mm, fill=1, stroke=0)
    canvas_obj.setFillColor(WHITE)
    canvas_obj.setFont(FONT_BOLD, 9)
    canvas_obj.drawString(MARGIN, H - 4*mm, 'LumaIQ')
    canvas_obj.setFont(FONT_REGULAR, 8)
    canvas_obj.drawRightString(W - MARGIN, H - 4*mm,
        f'{project_name} · стр. {doc.page}')
    canvas_obj.setFillColor(ACCENT)
    canvas_obj.rect(0, 0, W, 5*mm, fill=1, stroke=0)
    canvas_obj.setFillColor(WHITE)
    canvas_obj.setFont(FONT_REGULAR, 7)
    canvas_obj.drawString(MARGIN, 1.5*mm, 'Создано в LumaIQ')
    canvas_obj.drawRightString(W - MARGIN, 1.5*mm, 'lumaiq.ru')


def generate_strategy_pdf(output_path: str, project_name: str, answers: dict):
    from datetime import datetime
    date_str = datetime.now().strftime('%d.%m.%Y')
    styles   = make_styles()
    content_w = PAGE_W - 2 * MARGIN
    story: list = []

    story.append(Spacer(1, 8 * mm))
    story.append(Paragraph('АНАЛИЗ ЦЕЛЕВОЙ АУДИТОРИИ', styles['project_tag']))
    story.append(Paragraph(_safe(project_name), styles['doc_title']))
    story.append(Paragraph(
        f'Маркетинговая упаковка и JTBD-анализ · Создано {date_str}',
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
        topMargin=16 * mm, bottomMargin=14 * mm,
        title=f'Стратегия · {project_name}',
        author='LumaIQ',
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
