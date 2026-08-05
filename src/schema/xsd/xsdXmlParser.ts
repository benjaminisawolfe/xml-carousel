import {
  createXsdDiagnostic,
  sortXsdDiagnostics,
  type XsdDiagnostic,
} from './xsdDiagnostics';
import {
  lexXsdXml,
  parseXmlQualifiedName,
  type ParsedXmlQualifiedName,
  type XsdXmlToken,
} from './xsdXmlLexer';
import {
  createXsdSourceMap,
  xmlNamespaceUri,
  xmlnsNamespaceUri,
  type XsdXmlAttributeAst,
  type XsdXmlDocumentAst,
  type XsdXmlElementAst,
  type XsdXmlNodeAst,
  type XsdXmlProcessingInstructionAst,
} from './xsdXmlAst';

export interface XsdXmlParseResult {
  readonly document: XsdXmlDocumentAst;
  readonly diagnostics: readonly XsdDiagnostic[];
}

interface PendingAttribute {
  readonly nameToken: XsdXmlToken;
  readonly valueToken: XsdXmlToken;
}

interface ParsedEndTag {
  readonly qualifiedName?: string;
  readonly range: XsdXmlToken['range'];
}

function isWhitespaceText(token: XsdXmlToken): boolean {
  return token.kind === 'text' && /^[\t\r\n ]*$/.test(token.raw);
}

function expandedName(
  namespaceUri: string | undefined,
  localName: string,
): string {
  return `{${namespaceUri ?? ''}}${localName}`;
}

export function parseXsdXml(
  sourceText: string,
  sourceId?: string,
): XsdXmlParseResult {
  const sourceMap = createXsdSourceMap(sourceText, sourceId);
  const lexed = lexXsdXml(sourceText, sourceId);
  const tokens = lexed.tokens;
  const diagnostics: XsdDiagnostic[] = [...lexed.diagnostics];
  let tokenIndex = 0;
  let sourceOrder = 0;

  function nextOrder(): number {
    const order = sourceOrder;
    sourceOrder += 1;
    return order;
  }

  function current(): XsdXmlToken | undefined {
    return tokens[tokenIndex];
  }

  function consume(): XsdXmlToken | undefined {
    const value = tokens[tokenIndex];
    tokenIndex += 1;
    return value;
  }

  function diagnose(
    code: Parameters<typeof createXsdDiagnostic>[1],
    message: string,
    range: XsdXmlToken['range'],
  ): void {
    diagnostics.push(createXsdDiagnostic('xml', code, 'error', message, range));
  }

  function qualifiedName(token: XsdXmlToken): ParsedXmlQualifiedName {
    const value = token.value ?? token.raw;
    const parsed = parseXmlQualifiedName(value);
    if (parsed) return parsed;
    diagnose(
      'malformed-qname',
      `Malformed qualified name "${value}"`,
      token.range,
    );
    const colon = value.indexOf(':');
    return colon > 0 && colon === value.lastIndexOf(':')
      ? {
          qualifiedName: value,
          prefix: value.slice(0, colon),
          localName: value.slice(colon + 1) || value,
        }
      : { qualifiedName: value, localName: value };
  }

  function applyNamespaceDeclaration(
    pending: PendingAttribute,
    bindings: Record<string, string>,
  ): void {
    const parsedName = qualifiedName(pending.nameToken);
    const isDefault = parsedName.qualifiedName === 'xmlns';
    const isPrefixed = parsedName.prefix === 'xmlns';
    if (!isDefault && !isPrefixed) return;

    const bindingPrefix = isDefault ? '' : parsedName.localName;
    const uri = pending.valueToken.value ?? '';
    if (
      bindingPrefix === 'xmlns' ||
      uri === xmlnsNamespaceUri ||
      (bindingPrefix === 'xml' && uri !== xmlNamespaceUri) ||
      (bindingPrefix !== 'xml' && uri === xmlNamespaceUri)
    ) {
      diagnose(
        'reserved-namespace-binding',
        `Reserved namespace binding xmlns${bindingPrefix ? `:${bindingPrefix}` : ''}="${uri}" is invalid`,
        pending.nameToken.range,
      );
      return;
    }
    if (bindingPrefix !== '' && uri.length === 0) {
      diagnose(
        'invalid-namespace-declaration',
        `Namespace prefix "${bindingPrefix}" cannot be undeclared`,
        pending.valueToken.range,
      );
      return;
    }
    if (bindingPrefix === 'xml' && uri === xmlNamespaceUri) {
      bindings.xml = xmlNamespaceUri;
      return;
    }
    if (bindingPrefix === '') {
      if (uri.length === 0) {
        delete bindings[''];
      } else {
        bindings[''] = uri;
      }
      return;
    }
    bindings[bindingPrefix] = uri;
  }

  function resolveNamespace(
    parsedName: ParsedXmlQualifiedName,
    bindings: Readonly<Record<string, string>>,
    isAttribute: boolean,
    range: XsdXmlToken['range'],
  ): string | undefined {
    if (parsedName.qualifiedName === 'xmlns' || parsedName.prefix === 'xmlns') {
      return xmlnsNamespaceUri;
    }
    if (parsedName.prefix) {
      const namespaceUri = bindings[parsedName.prefix];
      if (namespaceUri === undefined) {
        diagnose(
          'undeclared-prefix',
          `Prefix "${parsedName.prefix}" is not declared`,
          range,
        );
      }
      return namespaceUri;
    }
    return isAttribute ? undefined : bindings[''];
  }

  function collectPendingAttributes(): {
    readonly attributes: readonly PendingAttribute[];
    readonly close?: XsdXmlToken;
  } {
    const attributes: PendingAttribute[] = [];
    while (current()) {
      const token = current()!;
      if (token.kind === 'tagClose' || token.kind === 'emptyTagClose') {
        return { attributes, close: consume() };
      }
      if (token.kind !== 'name') {
        diagnose(
          'unexpected-token',
          `Unexpected ${token.kind} inside a start tag`,
          token.range,
        );
        consume();
        continue;
      }
      const nameToken = consume()!;
      if (current()?.kind !== 'equals') {
        diagnose(
          'missing-equals',
          `Attribute "${nameToken.value ?? nameToken.raw}" is missing "="`,
          nameToken.range,
        );
        continue;
      }
      consume();
      const valueToken = current();
      if (valueToken?.kind === 'unquotedAttributeValue') {
        consume();
        continue;
      }
      if (valueToken?.kind !== 'attributeValue') {
        diagnose(
          'unquoted-attribute-value',
          `Attribute "${nameToken.value ?? nameToken.raw}" must have a quoted value`,
          valueToken?.range ?? nameToken.range,
        );
        if (valueToken?.kind === 'name') consume();
        continue;
      }
      consume();
      attributes.push({ nameToken, valueToken });
    }
    return { attributes };
  }

  function buildAttributes(
    pendingAttributes: readonly PendingAttribute[],
    bindings: Readonly<Record<string, string>>,
  ): readonly XsdXmlAttributeAst[] {
    const attributes: XsdXmlAttributeAst[] = [];
    const seen = new Set<string>();
    for (const pending of pendingAttributes) {
      const parsedName = qualifiedName(pending.nameToken);
      const namespaceUri = resolveNamespace(
        parsedName,
        bindings,
        true,
        pending.nameToken.range,
      );
      const key = expandedName(namespaceUri, parsedName.localName);
      if (seen.has(key)) {
        diagnose(
          'duplicate-attribute',
          `Duplicate attribute "${parsedName.qualifiedName}"`,
          pending.nameToken.range,
        );
      } else {
        seen.add(key);
      }
      attributes.push({
        qualifiedName: parsedName.qualifiedName,
        ...(parsedName.prefix === undefined
          ? {}
          : { prefix: parsedName.prefix }),
        localName: parsedName.localName,
        ...(namespaceUri === undefined ? {} : { namespaceUri }),
        value: pending.valueToken.value ?? '',
        rawValue: pending.valueToken.contentRange
          ? sourceText.slice(
              pending.valueToken.contentRange.start.offset,
              pending.valueToken.contentRange.end.offset,
            )
          : '',
        quote: pending.valueToken.quote ?? 'double',
        range: sourceMap.range(
          pending.nameToken.range.start.offset,
          pending.valueToken.range.end.offset,
        ),
        nameRange: pending.nameToken.range,
        valueRange: pending.valueToken.range,
        valueContentRange:
          pending.valueToken.contentRange ?? pending.valueToken.range,
        sourceOrder: nextOrder(),
      });
    }
    return attributes;
  }

  function parseEndTag(): ParsedEndTag {
    const open = consume()!;
    const nameToken = current()?.kind === 'name' ? consume() : undefined;
    if (!nameToken) {
      diagnose('malformed-name', 'End tag is missing its name', open.range);
    }
    while (
      current() &&
      current()!.kind !== 'tagClose' &&
      current()!.kind !== 'emptyTagClose'
    ) {
      diagnose(
        'unexpected-token',
        'Unexpected token inside an end tag',
        current()!.range,
      );
      consume();
    }
    const close = consume();
    if (!close) {
      diagnose('unterminated-tag', 'End tag is not terminated', open.range);
    }
    return {
      ...(nameToken === undefined
        ? {}
        : { qualifiedName: nameToken.value ?? nameToken.raw }),
      range: sourceMap.range(
        open.range.start.offset,
        close?.range.end.offset ??
          nameToken?.range.end.offset ??
          open.range.end.offset,
      ),
    };
  }

  function nodeFromToken(token: XsdXmlToken): XsdXmlNodeAst | undefined {
    if (token.kind === 'text') {
      return {
        kind: 'text',
        raw: token.raw,
        value: token.value ?? token.raw,
        range: token.range,
        sourceOrder: nextOrder(),
      };
    }
    if (token.kind === 'comment') {
      return {
        kind: 'comment',
        raw: token.raw,
        text: token.value ?? '',
        range: token.range,
        contentRange: token.contentRange ?? token.range,
        sourceOrder: nextOrder(),
      };
    }
    if (token.kind === 'cdata') {
      return {
        kind: 'cdata',
        raw: token.raw,
        value: token.value ?? '',
        range: token.range,
        contentRange: token.contentRange ?? token.range,
        sourceOrder: nextOrder(),
      };
    }
    if (
      token.kind === 'processingInstruction' ||
      token.kind === 'xmlDeclaration'
    ) {
      const node: XsdXmlProcessingInstructionAst = {
        kind: 'processingInstruction',
        raw: token.raw,
        target: token.target ?? '',
        data: token.data ?? '',
        range: token.range,
        sourceOrder: nextOrder(),
      };
      return node;
    }
    return undefined;
  }

  function parseElement(
    parentBindings: Readonly<Record<string, string>>,
  ): XsdXmlElementAst | undefined {
    const open = consume();
    if (!open || open.kind !== 'startTagOpen') return undefined;
    const nameToken = current()?.kind === 'name' ? consume() : undefined;
    if (!nameToken) {
      diagnose('malformed-name', 'Start tag is missing its name', open.range);
      while (
        current() &&
        current()!.kind !== 'tagClose' &&
        current()!.kind !== 'emptyTagClose'
      ) {
        consume();
      }
      consume();
      return undefined;
    }

    const elementOrder = nextOrder();
    const parsedName = qualifiedName(nameToken);
    const collected = collectPendingAttributes();
    const bindings: Record<string, string> = { ...parentBindings };
    for (const pending of collected.attributes) {
      applyNamespaceDeclaration(pending, bindings);
    }
    if (bindings.xml !== xmlNamespaceUri) bindings.xml = xmlNamespaceUri;

    const namespaceUri = resolveNamespace(
      parsedName,
      bindings,
      false,
      nameToken.range,
    );
    const attributes = buildAttributes(collected.attributes, bindings);
    const startTagEnd =
      collected.close?.range.end.offset ??
      attributes[attributes.length - 1]?.range.end.offset ??
      nameToken.range.end.offset;
    const startTagRange = sourceMap.range(open.range.start.offset, startTagEnd);

    if (!collected.close) {
      diagnose(
        'unterminated-tag',
        'Start tag is not terminated',
        startTagRange,
      );
      return {
        kind: 'element',
        qualifiedName: parsedName.qualifiedName,
        ...(parsedName.prefix === undefined
          ? {}
          : { prefix: parsedName.prefix }),
        localName: parsedName.localName,
        ...(namespaceUri === undefined ? {} : { namespaceUri }),
        attributes,
        children: [],
        namespaceBindings: bindings,
        range: startTagRange,
        startTagRange,
        sourceOrder: elementOrder,
      };
    }

    if (collected.close.kind === 'emptyTagClose') {
      return {
        kind: 'element',
        qualifiedName: parsedName.qualifiedName,
        ...(parsedName.prefix === undefined
          ? {}
          : { prefix: parsedName.prefix }),
        localName: parsedName.localName,
        ...(namespaceUri === undefined ? {} : { namespaceUri }),
        attributes,
        children: [],
        namespaceBindings: bindings,
        range: startTagRange,
        startTagRange,
        sourceOrder: elementOrder,
      };
    }

    const children: XsdXmlNodeAst[] = [];
    let endTagRange: XsdXmlToken['range'] | undefined;
    while (current()) {
      const token = current()!;
      if (token.kind === 'endTagOpen') {
        const endTag = parseEndTag();
        endTagRange = endTag.range;
        if (endTag.qualifiedName !== parsedName.qualifiedName) {
          diagnose(
            'mismatched-end-tag',
            `Expected </${parsedName.qualifiedName}> but found </${endTag.qualifiedName ?? ''}>`,
            endTag.range,
          );
        }
        break;
      }
      if (token.kind === 'startTagOpen') {
        const child = parseElement(bindings);
        if (child) children.push(child);
        continue;
      }
      consume();
      if (token.kind === 'xmlDeclaration') {
        diagnose(
          'misplaced-xml-declaration',
          'XML declaration is only allowed at the start of the document',
          token.range,
        );
      }
      const node = nodeFromToken(token);
      if (node) children.push(node);
    }

    if (!endTagRange) {
      diagnose(
        'missing-end-tag',
        `Element <${parsedName.qualifiedName}> is missing its end tag`,
        startTagRange,
      );
    }
    const rangeEnd =
      endTagRange?.end.offset ??
      children[children.length - 1]?.range.end.offset ??
      startTagRange.end.offset;
    return {
      kind: 'element',
      qualifiedName: parsedName.qualifiedName,
      ...(parsedName.prefix === undefined ? {} : { prefix: parsedName.prefix }),
      localName: parsedName.localName,
      ...(namespaceUri === undefined ? {} : { namespaceUri }),
      attributes,
      children,
      namespaceBindings: bindings,
      range: sourceMap.range(open.range.start.offset, rangeEnd),
      startTagRange,
      ...(endTagRange === undefined ? {} : { endTagRange }),
      sourceOrder: elementOrder,
    };
  }

  const documentChildren: XsdXmlNodeAst[] = [];
  let declaration: XsdXmlDocumentAst['declaration'];
  let root: XsdXmlElementAst | undefined;
  const rootBindings: Readonly<Record<string, string>> = {
    xml: xmlNamespaceUri,
  };

  while (current()) {
    const token = current()!;
    if (token.kind === 'xmlDeclaration') {
      consume();
      if (declaration) {
        diagnose(
          'multiple-xml-declarations',
          'Only one XML declaration is allowed',
          token.range,
        );
      } else {
        if (token.range.start.offset !== 0) {
          diagnose(
            'misplaced-xml-declaration',
            'XML declaration must begin at the start of the document',
            token.range,
          );
        }
        declaration = {
          kind: 'xmlDeclaration',
          raw: token.raw,
          target: token.target ?? 'xml',
          data: token.data ?? '',
          range: token.range,
          sourceOrder: nextOrder(),
        };
      }
      continue;
    }
    if (token.kind === 'startTagOpen') {
      const element = parseElement(rootBindings);
      if (element) {
        documentChildren.push(element);
        if (!root) {
          root = element;
        } else {
          diagnose(
            'multiple-roots',
            'XML document contains more than one root element',
            element.range,
          );
        }
      }
      continue;
    }
    if (token.kind === 'endTagOpen') {
      const endTag = parseEndTag();
      diagnose(
        'unexpected-end-tag',
        `Unexpected end tag </${endTag.qualifiedName ?? ''}>`,
        endTag.range,
      );
      continue;
    }
    consume();
    const node = nodeFromToken(token);
    if (node) {
      documentChildren.push(node);
      if (
        (node.kind === 'text' && node.value.trim().length > 0) ||
        node.kind === 'cdata'
      ) {
        diagnose(
          'text-outside-root',
          'Character data is not allowed outside the root element',
          node.range,
        );
      }
    } else if (
      token.kind !== 'unsupportedDeclaration' &&
      !isWhitespaceText(token)
    ) {
      diagnose(
        'unexpected-token',
        `Unexpected ${token.kind} outside the root element`,
        token.range,
      );
    }
  }

  if (!root) {
    diagnostics.push(
      createXsdDiagnostic(
        'xml',
        'empty-document',
        'error',
        sourceText.trim().length === 0
          ? 'XML document is empty'
          : 'XML document has no root element',
        sourceMap.range(0, sourceText.length),
      ),
    );
  }

  return {
    document: {
      kind: 'document',
      ...(declaration === undefined ? {} : { declaration }),
      children: documentChildren,
      ...(root === undefined ? {} : { root }),
      range: sourceMap.range(0, sourceText.length),
    },
    diagnostics: sortXsdDiagnostics(diagnostics),
  };
}
