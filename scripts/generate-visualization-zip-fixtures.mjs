import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';

const outputDirectory = path.resolve('tests/fixtures/zip/visualization');
const entryOptions = { date: new Date('2026-01-01T00:00:00.000Z') };
const archiveOptions = {
  type: 'uint8array',
  compression: 'DEFLATE',
  compressionOptions: { level: 9 },
  platform: 'DOS',
};

async function writeArchive(filename, entries) {
  const archive = new JSZip();
  for (const [entryPath, sourceText] of entries) {
    archive.file(entryPath, sourceText, {
      ...entryOptions,
      createFolders: false,
    });
  }
  await writeFile(
    path.join(outputDirectory, filename),
    await archive.generateAsync(archiveOptions),
  );
}

await mkdir(outputDirectory, { recursive: true });

await writeArchive('partial-and-complete.zip', [
  ['project/complete.dtd', '<!ELEMENT complete EMPTY>\n'],
  [
    'project/partial.dtd',
    '<!ELEMENT partial EMPTY>\n<!ENTITY retained "value">\n',
  ],
]);

await writeArchive('same-basename-partial.zip', [
  [
    'project/one/schema.xsd',
    '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:element name="one" type="xs:string"/><xs:group name="oneGroup"><xs:sequence/></xs:group></xs:schema>\n',
  ],
  [
    'project/two/schema.xsd',
    '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:element name="two" type="xs:string"/></xs:schema>\n',
  ],
]);

await writeArchive('resolved-include-partial.zip', [
  [
    'project/main.xsd',
    '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:include schemaLocation="included.xsd"/><xs:element name="root" type="IncludedType"/></xs:schema>\n',
  ],
  [
    'project/included.xsd',
    '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:complexType name="IncludedType"><xs:sequence/></xs:complexType><xs:attributeGroup name="extra"><xs:attribute name="id"/></xs:attributeGroup></xs:schema>\n',
  ],
]);

await writeArchive('missing-include-fatal.zip', [
  [
    'project/main.xsd',
    '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:include schemaLocation="missing.xsd"/><xs:element name="root" type="xs:string"/></xs:schema>\n',
  ],
]);

await writeArchive('common-root-nested-includes.zip', [
  [
    'project-root/common.xsd',
    '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:t="urn:generic-package" targetNamespace="urn:generic-package"><xs:include schemaLocation="rich-text.xsd"/><xs:complexType name="CommonType"><xs:sequence><xs:element name="body" type="t:RichTextType"/></xs:sequence></xs:complexType></xs:schema>\n',
  ],
  [
    'project-root/rich-text.xsd',
    '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:generic-package"><xs:simpleType name="RichTextType"><xs:restriction base="xs:string"/></xs:simpleType></xs:schema>\n',
  ],
  [
    'project-root/rules.xsd',
    '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:t="urn:generic-package" targetNamespace="urn:generic-package"><xs:group name="RuleContent"><xs:sequence><xs:element name="rule" type="xs:string"/></xs:sequence></xs:group><xs:complexType name="RulesType"><xs:group ref="t:RuleContent"/></xs:complexType></xs:schema>\n',
  ],
  [
    'project-root/entity.xsd',
    '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:t="urn:generic-package" targetNamespace="urn:generic-package"><xs:include schemaLocation="common.xsd"/><xs:include schemaLocation="rules.xsd"/><xs:complexType name="EntityType"><xs:complexContent><xs:extension base="t:CommonType"><xs:sequence><xs:element name="rules" type="t:RulesType" minOccurs="0"/></xs:sequence></xs:extension></xs:complexContent></xs:complexType></xs:schema>\n',
  ],
  [
    'project-root/entities/character.xsd',
    '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:t="urn:generic-package" targetNamespace="urn:generic-package"><xs:include schemaLocation="../entity.xsd"/><xs:element name="character" type="t:EntityType"/></xs:schema>\n',
  ],
]);
