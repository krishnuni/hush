import JSZip from 'jszip';

export const SAMPLE_BOOKS = [
  { title: 'The Shape of Quiet', subtitle: 'A short story about returning', tone: 'forest' },
  {
    title: 'Letters from the Estuary',
    subtitle: 'Three letters, one changing shore',
    tone: 'clay',
  },
  { title: 'Small Celestial Bodies', subtitle: 'Notes for a clear evening', tone: 'slate' },
] as const;

export function coverSvg(title: string, tone: string, author = 'HUSH EDITIONS'): string {
  const colours: Record<string, [string, string]> = {
    forest: ['#b9c0a0', '#293d31'],
    clay: ['#b4553b', '#f7ead8'],
    slate: ['#2d3d43', '#e7e3cc'],
  };
  const [bg, fg] = colours[tone] ?? colours.forest;
  const words = title.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (line && (line + ' ' + word).trim().length > 14) {
      lines.push(line);
      line = word;
    } else line = (line + ' ' + word).trim();
  }
  lines.push(line);
  const escape = (text: string) =>
    text
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  const text = (y: number, size = 30) =>
    lines
      .slice(0, 5)
      .map(
        (t, i) =>
          `<text x="28" y="${y + i * (size + 3)}" font-family="Georgia,serif" font-size="${size}" fill="${fg}">${escape(t.slice(0, 27))}</text>`,
      )
      .join('');
  const imprint = `<text x="28" y="426" font-family="sans-serif" letter-spacing="1.5" font-size="8" fill="${fg}">${escape(author.toUpperCase().slice(0, 38))}</text>`;
  const number = tone === 'forest' ? '001' : tone === 'clay' ? '002' : '003';
  const small = `<text x="28" y="31" font-family="sans-serif" letter-spacing="2" font-size="8" fill="${fg}">H / ${number}</text><path d="M251 21h15v17l-7-4-8 4V21Z" fill="${fg}"/>`;
  const artwork =
    tone === 'forest'
      ? `<path d="M66 194V88h168v237H66v-61h93v-70H66Z" fill="${fg}"/><path d="M183 88h51v51l-51-51Z" fill="#e8e8d3"/><path d="M77 100h93v83H77z" fill="${bg}"/><path d="M159 264h63v49h-63z" fill="${bg}"/>${text(357, 29)}`
      : tone === 'clay'
        ? `${text(89, 32)}<path d="M28 267c68-108 135 111 244-1M28 284c68-108 135 111 244-1M28 301c68-108 135 111 244-1M28 318c68-108 135 111 244-1M28 335c68-108 135 111 244-1M28 352c68-108 135 111 244-1" fill="none" stroke="${fg}" stroke-width="1.5"/><path d="M28 224h44" stroke="${fg}"/>`
        : `<circle cx="153" cy="179" r="85" stroke="${fg}" stroke-width=".7" fill="none"/><ellipse cx="153" cy="179" rx="106" ry="40" transform="rotate(-38 153 179)" stroke="${fg}" stroke-width=".7" fill="none"/><circle cx="153" cy="179" r="34" fill="${fg}"/><circle cx="217" cy="100" r="6" fill="#b9c0a0"/><path d="M153 66v19M153 273v19M42 179h19M245 179h19" stroke="${fg}" stroke-width=".7"/>${text(341, 26)}`;
  // Imported titles can be much longer than the original editions. A dedicated typeset
  // treatment reserves the full page for them rather than clipping over the artwork.
  const original = SAMPLE_BOOKS.some((sample) => sample.title === title);
  const ornament =
    tone === 'forest'
      ? `<path d="M222 302h50v50h-50z" stroke="${fg}" fill="none"/><path d="m222 302 50 50h-50z" fill="${fg}"/>`
      : tone === 'clay'
        ? `<circle cx="221" cy="337" r="47" fill="${fg}"/><path d="M28 320h222M28 337h222M28 354h222" stroke="${bg}" stroke-width="2"/>`
        : `<path d="M28 300v68M42 300v68M56 300v68M70 300v68M84 300v68" stroke="${fg}" stroke-width="1"/><circle cx="245" cy="338" r="24" stroke="${fg}" fill="none"/>`;
  const fallback = `<path d="M28 67h244M28 388h244" stroke="${fg}" stroke-width=".7"/>${text(tone === 'clay' ? 106 : 122, 29)}${ornament}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 450"><rect width="300" height="450" fill="${bg}"/>${small}${original ? artwork : fallback}${imprint}</svg>`;
}

const quietChapters = [
  {
    title: 'The return',
    paragraphs: [
      'Mara arrived before the morning had made up its mind. At the station, the clock was still a little slow. She remembered that about the town: time was something people allowed to find its own pace.',
      'She walked towards the water with a small bag and no particular plan. The bakery window was warm. A bicycle leaned against the wall where a bicycle had always seemed to lean.',
      'At the corner, she stopped to listen. Somewhere a cup was set on a table. A door closed gently, and the sound travelled down the empty street.',
      'The sea was out beyond the houses. She could not see it yet, but the air had already told her it was there. Salt gathered on the railings and in the cracks between old stones.',
      'She had brought a book she had never finished. Its pages held the receipt from a city shop, a small record of a different kind of afternoon.',
      'For the first time in months, there was no next thing to hurry towards. She put her phone in the bottom of her bag and continued walking.',
    ],
  },
  {
    title: 'A room by the water',
    paragraphs: [
      'The room was above a closed workshop. There was a table, a narrow bed, and a chair whose seat had been polished by years of other people reading.',
      'When she opened the window, the curtains moved towards the water. The harbour lay below her, its boats turning almost imperceptibly on their ropes.',
      'She placed her book on the table. A little sunlight reached the cover. The room did not ask her to arrange it, improve it, or explain why she had come.',
      'In the afternoon she made tea. She let it cool while watching a bird work along the edge of the quay, pausing at every promising shadow.',
      'A sentence she had read years ago returned without its author. Perhaps that was one of the uses of reading: to leave small windows open in the mind.',
      'She began again at the first page. The words had not changed, but the space around them had. That was enough to make the book feel new.',
    ],
  },
  {
    title: 'Where the light settles',
    paragraphs: [
      'By the time Mara reached the estuary, the last ferry had gone. Across the water, the windows held the colour of the sky.',
      'She had learned to recognise the town by its pauses: the minute after a train, the breath between two waves.',
      'Nothing here was quite silent. A rope touched a mast. Somewhere behind the houses, someone was washing a cup. These were small sounds, but they made a room of the evening.',
      'She sat on the low wall and opened her book. For a while, there was nowhere else she needed to be.',
      'When the first light appeared on the far shore, she looked up. It was an ordinary light in an ordinary window. She was surprised by how much comfort an ordinary thing could offer.',
      'Later, she would remember this as an evening when nothing happened. She would know, too, that this was not quite true.',
    ],
  },
];

export async function createSampleBook(index = 0): Promise<File> {
  const chapters =
    index === 1
      ? [
          {
            title: 'The first letter',
            paragraphs: [
              'Dear Elin, the tide was out when I arrived. From the upstairs window I could see the long backs of the boats resting in the mud. For once, being early meant that I had time to wait.',
              'There is a postbox beside the harbour office. Its red paint is peeling at the corners. I bought three stamps from the shop, although I do not yet know what the other two letters will say.',
              'You asked whether this place had changed. The old bridge has a new handrail. The shop closes an hour earlier. A tree we used to pass without noticing is now the largest thing in its street.',
              'I thought about taking a photograph for you. Instead, I am writing this at the window while the light moves across the empty channel. Perhaps a letter can keep a little of the time it took to make.',
            ],
          },
          {
            title: 'Between tides',
            paragraphs: [
              'This morning the water returned so quietly that I missed the first boat lifting from the mud. By breakfast they were all afloat, turning together towards the mouth of the estuary.',
              'I walked to the bridge with your last letter in my pocket. There was one sentence I wanted to read again. Paper is useful that way: it is easy to carry a voice somewhere its owner has never been.',
              'A woman on the bridge told me the names of three birds. I remembered only one. We watched the other two without names, which seemed to suit them just as well.',
              'I am learning that a shore is a place you have to visit more than once. The map gives it a line. The water gives it an argument.',
            ],
          },
          {
            title: 'A place on the envelope',
            paragraphs: [
              'The last stamp is on the table. Tomorrow I will take the early train, and this room will become a room I once stayed in. I am trying to notice it without turning it into a memory too soon.',
              'At dusk I went to the postbox. A small light was burning in the harbour office. The person inside looked up and waved as though posting a letter were reason enough to be recognised.',
              'You can meet me at the station if the weather is fine. If it rains, stay at home and put the kettle on. I know the way from there.',
              'I have left a blank page in the notebook. There are things I would rather tell you when we have time to interrupt each other.',
            ],
          },
        ]
      : index === 2
        ? [
            {
              title: 'Before the first star',
              paragraphs: [
                'The best place to watch the evening sky is not always the darkest place. Sometimes it is simply a place where you are comfortable enough to stay until your eyes begin to notice more.',
                'I put a chair beside the back door. The garden still held the warmth of the day. Above the roof, a pale point appeared before the blue had quite left the sky.',
                'I had brought a notebook to make a record. For several minutes the page remained empty. Looking was already something to do.',
                'A plane crossed the little patch of sky between the chimney and the tree. Its lights moved steadily. The point above the roof did not move at all.',
              ],
            },
            {
              title: 'The space between',
              paragraphs: [
                'A constellation is a way of joining things that are far apart. From this chair the pattern seems obvious. Somewhere else, from another distance, there would be a different picture.',
                'I drew five dots on the page and left the lines out. The empty spaces were larger than I had expected. It was hard to resist making them into something.',
                'The tree moved in a small wind. For a moment one of the dots in the sky disappeared behind a leaf. Then it returned, as if someone had corrected a tiny omission.',
                'I wrote down the time. Beneath it I wrote: clear, with a little wind. A useful note can be very simple.',
              ],
            },
            {
              title: 'A clear evening',
              paragraphs: [
                'By the time I took the chair inside, there were more lights than I could comfortably count. I had stopped trying to name them. The names would still be there in the book tomorrow.',
                'Through the kitchen window I could see the cup I had left on the table. It looked surprisingly bright. Behind me the garden had become a collection of familiar shapes with their colours taken away.',
                'The notebook held half a page. It was enough to bring back the evening, though it could not have explained the evening to anyone who had not been there.',
                'Before closing the door, I looked up once more. The sky had continued without needing me to finish my notes.',
              ],
            },
          ]
        : quietChapters;
  const sample = SAMPLE_BOOKS[index];
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file(
    'META-INF/container.xml',
    '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
  );
  zip.file('OEBPS/cover.svg', coverSvg(sample.title, sample.tone));
  zip.file(
    'OEBPS/style.css',
    'body{font-family:serif;line-height:1.65;color:#2b302c}h1{font-weight:400;line-height:1.25;margin:1.3em 0 1.1em}p{margin:0 0 1.05em}img{max-width:100%;height:auto}',
  );
  zip.file(
    'OEBPS/nav.xhtml',
    `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><h1>Contents</h1><ol>${chapters.map((c, i) => `<li><a href="chapter${i + 1}.xhtml">${c.title}</a></li>`).join('')}</ol></nav></body></html>`,
  );
  for (const [i, chapter] of chapters.entries())
    zip.file(
      `OEBPS/chapter${i + 1}.xhtml`,
      `<html xmlns="http://www.w3.org/1999/xhtml"><head><title>${chapter.title}</title><link rel="stylesheet" href="style.css"/></head><body><h1>${chapter.title}</h1>${chapter.paragraphs.map((p, j) => `<p id="p${j}">${p}</p>`).join('')}${i === 1 ? '<figure><img src="cover.svg" alt="An abstract Hush edition jacket, composed of geometric shapes." width="240"/><figcaption>An original Hush cover study.</figcaption></figure>' : ''}</body></html>`,
    );
  zip.file(
    'OEBPS/book.opf',
    `<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">urn:hush:sample:${index}</dc:identifier><dc:title>${sample.title}</dc:title><dc:creator>Hush original samples</dc:creator><dc:language>en</dc:language><meta property="dcterms:modified">2026-10-23T00:00:00Z</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="style" href="style.css" media-type="text/css"/><item id="cover" href="cover.svg" media-type="image/svg+xml" properties="cover-image"/>${chapters.map((_, i) => `<item id="c${i + 1}" href="chapter${i + 1}.xhtml" media-type="application/xhtml+xml"/>`).join('')}</manifest><spine>${chapters.map((_, i) => `<itemref idref="c${i + 1}"/>`).join('')}</spine></package>`,
  );
  zip.forEach((_path, file) => {
    file.date = new Date('2026-10-23T00:00:00Z');
  });
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  return new File([new Uint8Array(bytes)], `${sample.title}.epub`, {
    type: 'application/epub+zip',
  });
}
