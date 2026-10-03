import ProposalEditor from "./proposal-editor";
import "./proposal-editor.css";

export default async function CommercialProposalPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <ProposalEditor projectId={projectId}/>;
}
