import { Company } from "@/components/resume/Company";
import { ResumeSection } from "@/components/resume/ResumeSection";
import { DownloadIcon } from "@/components/Icon";

export default function Resume() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-16">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-4xl font-bold">Resume</h1>
        {/* Download link — styled as a small outlined button using the site accent color */}
        <a
          href="/resume.pdf"
          download="GrassianRobert_Resume.pdf"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-link/40 text-link text-sm font-medium hover:bg-link/8 transition-colors duration-150 shrink-0"
        >
          <DownloadIcon className="w-4 h-4" aria-hidden />
          Download PDF
        </a>
      </div>

      <div className="mt-12 space-y-14">
        {/* --- Experience --- */}
        <ResumeSection title="Experience">
          <div className="mt-8 space-y-10">
            {/* Harness */}
            <Company
              name="Harness"
              location="New York, NY (remote)"
              roles={[
                {
                  title: "Senior Software Engineer - Feature Management & Experimentation",
                  dateRange: "May 2024 - Present",
                  sections: [
                    {
                      label: "Projects",
                      items: [
                        "Led implementation of Warehouse Native Experimentation support, enabling customers to run experiments directly against their data warehouses",
                        "Architected the usage reporting data pipeline, including the Temporal Workflow and dedicated Tinybird (ClickHouse) MVs, to power Harness's flexible pricing model for FME",
                        "Engineered the MCP server toolset for Harness FME, enabling AI agents to autonomously identify and clean up stale feature flags and analyze which code paths are live in production",
                      ],
                    },
                    {
                      label: "Leadership",
                      items: [
                        "Serve as a Tech Lead on a 15-person engineering team, owning architectural decisions and coordinating cross-functionally with product and stakeholders",
                        "Facilitate Agentic AI trainings for the 80+ engineers in the FME module to build team knowledge of the latest innovations, increasing AI adoption rate and creation of internal marketplace for Claude Code plugins",
                      ],
                    },
                  ],
                },
              ]}
            />

            {/* Split */}
            <Company
              name="Split Software"
              location="Redwood City, CA"
              subtitle="Acquired by Harness"
              roles={[
                {
                  title: "Software Engineer - Measurement and Experimentation",
                  dateRange: "Jan 2023 - May 2024",
                  sections: [
                    {
                      items: [
                        "Redesigned experimentation from a feature flag add-on to its own dedicated entity and services, establishing the foundation for all modern experimentation calculations",
                        "Migrated experimentation platform from Databricks Spark to Tinybird OLAP data platform, enabling real-time data analytics on experiment results",
                      ],
                    },
                  ],
                },
                {
                  title: "Software Engineer - Office of the CTO",
                  dateRange: "Jul 2021 - Jan 2023",
                  sections: [
                    {
                      items: [
                        "Implemented a RAG-based chatbot on Split's documentation and blogs to help customers navigate Split's product",
                        "Prototyped a system for ingesting external feature flags into Split, validated technical feasibility and customer demand, and handed off to Engineering to productionize",
                        "Developed various OpenFeature providers to allow vendor-agnostic use of Split's SDKs, including Java, Go, JavaScript, and Python providers",
                      ],
                    },
                  ],
                },
              ]}
            />

            {/* Cisco */}
            <Company
              name="Cisco Systems, Inc. - Webex"
              location="San Jose, CA"
              roles={[
                {
                  title: "Software Engineer",
                  dateRange: "Jul 2020 - Jul 2021",
                  sections: [
                    {
                      items: [
                        "Built and shipped a full-stack Notification Center microservice for Webex Control Hub, owning both backend APIs and frontend integration",
                        "Designed and compared two approaches to detecting Webex call quality degradation: an autoencoder-based ML model and a statistical threshold detector using 95th-percentile sliding window analysis",
                      ],
                    },
                  ],
                },
              ]}
            />
          </div>
        </ResumeSection>

        {/* --- Education --- */}
        <ResumeSection title="Education">
          <div className="mt-6">
            <h3 className="text-xl font-bold">University of California, Berkeley</h3>
            <p className="font-medium text-emphasis mt-1">
              Bachelor&apos;s Degree in Computer Science
            </p>
            <p className="text-sm text-muted">May 2020</p>
            <p className="text-sm text-muted mt-1">
              Entrepreneurship and Technology Certificate from the Sutardja Center
            </p>
          </div>
        </ResumeSection>

        {/* --- Skills & Interests --- */}
        <ResumeSection title="Skills & Interests">
          <div className="mt-6 space-y-2 text-sm text-body">
            <p>
              <span className="font-medium text-emphasis">Languages:</span> Java, Python, SQL
            </p>
            <p>
              <span className="font-medium text-emphasis">Technologies:</span> Temporal, Apache
              Kafka, ClickHouse, Tinybird, Spring Boot, Pandas
            </p>
            <p>
              <span className="font-medium text-emphasis">Agentic development:</span> MCP server
              tooling, Claude Code, Agent Skills (/pr-review, /todo, /explain)
            </p>
            <p className="mt-4">
              <span className="font-medium text-emphasis">Interests:</span> Bouldering, Crochet, Dog
              Walking, Video Games
            </p>
          </div>
        </ResumeSection>
      </div>
    </main>
  );
}
