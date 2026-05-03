import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Footer, AlignmentType,
} from 'docx';
import { saveAs } from 'file-saver';

export async function exportToDocx(
  title: string,
  content: string,
  filename: string,
): Promise<void> {
  const contentParagraphs = content
    .split('\n')
    .map((line) =>
      new Paragraph({
        children: [new TextRun({ text: line, size: 24 })],
        spacing: { after: 120 },
      }),
    );

  const doc = new Document({
    sections: [
      {
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: 'Создано в LumaIQ',
                    size: 18,
                    color: '888888',
                  }),
                ],
                alignment: AlignmentType.CENTER,
              }),
            ],
          }),
        },
        children: [
          new Paragraph({
            text: title,
            heading: HeadingLevel.HEADING_1,
            spacing: { after: 240 },
          }),
          new Paragraph({ children: [], spacing: { after: 120 } }),
          ...contentParagraphs,
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const safe = filename.replace(/[<>:"/\\|?*]/g, '').trim() || 'document';
  saveAs(blob, `${safe}.docx`);
}
