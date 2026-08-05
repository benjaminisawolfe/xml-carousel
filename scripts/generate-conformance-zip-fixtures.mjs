import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';

const zip = new JSZip();
const options = { date: new Date('2026-01-01T00:00:00.000Z') };
zip.file(
  'schemas/main.xsd',
  `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:include schemaLocation="included.xsd"/>
  <xs:element name="catalog" type="CatalogType"/>
</xs:schema>
`,
  options,
);
zip.file(
  'schemas/included.xsd',
  `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:complexType name="CatalogType">
    <xs:sequence><xs:element name="item" type="xs:string"/></xs:sequence>
  </xs:complexType>
</xs:schema>
`,
  options,
);

const bytes = await zip.generateAsync({
  type: 'uint8array',
  compression: 'DEFLATE',
  compressionOptions: { level: 9 },
  platform: 'DOS',
});
await writeFile(
  path.resolve('tests/fixtures/zip/valid-xsd-include.zip'),
  bytes,
);
