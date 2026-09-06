import type { Metadata } from "next";
import { ModelWorkspace } from "./ModelWorkspace";

export const metadata: Metadata = {
  title: "OCEANNOVA — Live Model Workspace",
  description:
    "The OCEANNOVA detection model running live: continuously ingesting NASA PACE OCI L2 granules and NOAA ocean data, then detecting, explaining and classifying ocean anomalies.",
};

export default function ModelPage() {
  return <ModelWorkspace />;
}
