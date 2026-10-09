import type {
  PropertyValue,
  Subject,
  WebIdDocument,
} from "@solid-memo/domain/webIdDocument";
import { ExternalLink } from "./ExternalLink";

export function WebIdDocumentView({ document }: { document: WebIdDocument }) {
  return (
    <>
      {document.subjects.map((subject) => (
        <SubjectView key={subject.url} subject={subject} />
      ))}
    </>
  );
}

/** Renders one subject of the WebID document as a predicate/object table. */
function SubjectView({ subject }: { subject: Subject }) {
  return (
    <section class="thing">
      <h3>
        <ExternalLink url={subject.url} />
      </h3>
      <table>
        <tbody>
          {subject.properties.map((property) => (
            <tr key={property.predicate}>
              <th scope="row">
                <ExternalLink url={property.predicate} />
              </th>
              <td>
                <ul>
                  {property.values.map((value) => (
                    <li key={formatValue(value)}>
                      <ValueView value={value} />
                    </li>
                  ))}
                </ul>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function ValueView({ value }: { value: PropertyValue }) {
  if (value.type === "iri") {
    return <ExternalLink url={value.value} />;
  }
  return <>{formatValue(value)}</>;
}

function formatValue(value: PropertyValue): string {
  switch (value.type) {
    case "iri":
      return value.value;
    case "literal":
      return `"${value.value}" (${value.dataType})`;
    case "langString":
      return `"${value.value}"@${value.language}`;
    case "blankNode":
      return value.value;
  }
}
