import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.net.URI;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import javax.xml.XMLConstants;
import javax.xml.parsers.SAXParserFactory;
import javax.xml.transform.stream.StreamSource;
import javax.xml.validation.SchemaFactory;
import org.w3c.dom.ls.LSInput;
import org.w3c.dom.ls.LSResourceResolver;
import org.xml.sax.ErrorHandler;
import org.xml.sax.InputSource;
import org.xml.sax.SAXException;
import org.xml.sax.SAXParseException;
import org.xml.sax.XMLReader;
import org.xml.sax.ext.EntityResolver2;

public final class XercesJSchemaComparator {
  private static final class Diagnostics implements ErrorHandler {
    private int errors;

    private void print(String severity, SAXParseException exception) {
      if (!severity.equals("warning")) errors += 1;
      System.out.printf(
          "diagnostic\t%s\t%s\t%d\t%d\t%s%n",
          severity,
          exception.getSystemId(),
          exception.getLineNumber(),
          exception.getColumnNumber(),
          exception.getMessage().replace('\t', ' '));
    }

    public void warning(SAXParseException exception) { print("warning", exception); }
    public void error(SAXParseException exception) { print("error", exception); }
    public void fatalError(SAXParseException exception) { print("error", exception); }
  }

  private static final class LocalInput implements LSInput {
    private InputStream byteStream;
    private String systemId;
    private String publicId;
    private String baseUri;

    LocalInput(InputStream byteStream, String systemId, String publicId, String baseUri) {
      this.byteStream = byteStream;
      this.systemId = systemId;
      this.publicId = publicId;
      this.baseUri = baseUri;
    }

    public InputStream getByteStream() { return byteStream; }
    public void setByteStream(InputStream value) { byteStream = value; }
    public String getSystemId() { return systemId; }
    public void setSystemId(String value) { systemId = value; }
    public String getPublicId() { return publicId; }
    public void setPublicId(String value) { publicId = value; }
    public String getBaseURI() { return baseUri; }
    public void setBaseURI(String value) { baseUri = value; }
    public String getStringData() { return null; }
    public void setStringData(String value) {}
    public java.io.Reader getCharacterStream() { return null; }
    public void setCharacterStream(java.io.Reader value) {}
    public String getEncoding() { return null; }
    public void setEncoding(String value) {}
    public boolean getCertifiedText() { return false; }
    public void setCertifiedText(boolean value) {}
  }

  private static final class LocalResolver implements LSResourceResolver, EntityResolver2 {
    private final File root;
    private final Path rootPath;

    LocalResolver(File root) throws Exception {
      this.root = root.getCanonicalFile();
      this.rootPath = this.root.toPath();
    }

    private File resolveFile(String baseUri, String systemId) throws Exception {
      URI resolved;
      if (baseUri != null && !baseUri.isBlank()) {
        resolved = URI.create(baseUri).resolve(systemId);
      } else {
        resolved = new File(root, systemId).toURI();
      }
      if (!"file".equalsIgnoreCase(resolved.getScheme())) {
        throw new SAXException("Comparator blocked non-file dependency: " + systemId);
      }
      File file = new File(resolved).getCanonicalFile();
      if (!file.toPath().startsWith(rootPath)) {
        throw new SAXException("Comparator blocked dependency outside corpus root: " + systemId);
      }
      return file;
    }

    public LSInput resolveResource(
        String type, String namespaceUri, String publicId, String systemId, String baseUri) {
      try {
        File file = resolveFile(baseUri, systemId);
        return new LocalInput(new FileInputStream(file), file.toURI().toString(), publicId, baseUri);
      } catch (Exception exception) {
        throw new IllegalStateException(exception.getMessage(), exception);
      }
    }

    public InputSource resolveEntity(String publicId, String systemId) throws SAXException {
      return resolveEntity(null, publicId, null, systemId);
    }

    public InputSource resolveEntity(
        String name, String publicId, String baseUri, String systemId) throws SAXException {
      try {
        File file = resolveFile(baseUri, systemId);
        InputSource input = new InputSource(new FileInputStream(file));
        input.setSystemId(file.toURI().toString());
        input.setPublicId(publicId);
        return input;
      } catch (SAXException exception) {
        throw exception;
      } catch (Exception exception) {
        throw new SAXException(exception);
      }
    }

    public InputSource getExternalSubset(String name, String baseUri) { return null; }
  }

  private static boolean validateSchema(File file, File root, Diagnostics diagnostics)
      throws Exception {
    SchemaFactory factory = SchemaFactory.newInstance(
        XMLConstants.W3C_XML_SCHEMA_NS_URI,
        "org.apache.xerces.jaxp.validation.XMLSchemaFactory",
        Thread.currentThread().getContextClassLoader());
    factory.setErrorHandler(diagnostics);
    factory.setResourceResolver(new LocalResolver(root));
    try {
      factory.setProperty(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "file");
      factory.setProperty(XMLConstants.ACCESS_EXTERNAL_DTD, "");
    } catch (SAXException unsupportedJaxpProperty) {
      System.out.printf(
          "diagnostic\twarning\t%s\t0\t0\t%s; controlled LocalResolver remains active%n",
          file.toURI(),
          unsupportedJaxpProperty.getMessage().replace('\t', ' '));
    }
    try {
      factory.newSchema(new StreamSource(file));
    } catch (SAXParseException exception) {
      if (diagnostics.errors == 0) diagnostics.fatalError(exception);
    }
    return diagnostics.errors == 0;
  }

  private static boolean validateXml(File file, File root, Diagnostics diagnostics)
      throws Exception {
    SAXParserFactory factory = SAXParserFactory.newInstance(
        "org.apache.xerces.jaxp.SAXParserFactoryImpl",
        Thread.currentThread().getContextClassLoader());
    factory.setNamespaceAware(true);
    factory.setValidating(true);
    XMLReader reader = factory.newSAXParser().getXMLReader();
    reader.setErrorHandler(diagnostics);
    reader.setEntityResolver(new LocalResolver(root));
    try {
      reader.parse(file.toURI().toString());
    } catch (SAXParseException exception) {
      if (diagnostics.errors == 0) diagnostics.fatalError(exception);
    }
    return diagnostics.errors == 0;
  }

  public static void main(String[] arguments) throws Exception {
    String mode = "xsd";
    File root = null;
    List<String> files = new ArrayList<>();
    for (int index = 0; index < arguments.length; index += 1) {
      if (arguments[index].equals("--mode")) mode = arguments[++index];
      else if (arguments[index].equals("--root")) root = new File(arguments[++index]);
      else files.add(arguments[index]);
    }
    if (root == null || files.isEmpty() || !(mode.equals("xsd") || mode.equals("xml"))) {
      throw new IllegalArgumentException(
          "Usage: XercesJSchemaComparator --mode xsd|xml --root <controlled-root> <files...>");
    }
    for (String argument : files) {
      Diagnostics diagnostics = new Diagnostics();
      File file = new File(argument).getCanonicalFile();
      boolean valid;
      try {
        Path controlledRoot = root.getCanonicalFile().toPath();
        if (!file.toPath().startsWith(controlledRoot)) {
          throw new SAXException("Comparator blocked input outside corpus root: " + argument);
        }
        valid = mode.equals("xsd")
            ? validateSchema(file, root, diagnostics)
            : validateXml(file, root, diagnostics);
      } catch (Exception exception) {
        valid = false;
        System.out.printf(
            "diagnostic\terror\t%s\t0\t0\t%s%n",
            file.toURI(),
            exception.getMessage().replace('\t', ' '));
      }
      System.out.printf(
          "result\t%s\t%s\t%s%n", mode, valid ? "valid" : "invalid", argument);
    }
  }
}
