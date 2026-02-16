import Link from "next/link";

export default function Resume() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      <Link href="/" className="text-blue-600 hover:underline">
        &larr; Home
      </Link>

      <h1 className="mt-6 text-4xl font-bold">Resume</h1>

      {/* --- Experience --- */}
      <section className="mt-12">
        <h2 className="text-2xl font-semibold border-b pb-2">Experience</h2>

        {/* Harness */}
        <div className="mt-8">
          <h3 className="text-xl font-bold">Harness</h3>

          <div className="mt-3 ml-4 border-l-2 border-gray-200 pl-4">
            <p className="font-medium text-gray-800">Senior Software Engineer</p>
            <p className="text-sm text-gray-500">Jun 2024 &ndash; Present</p>
          </div>
        </div>

        {/* Split */}
        <div className="mt-10">
          <h3 className="text-xl font-bold">Split Software</h3>
          <p className="text-sm text-gray-500 mt-1">Acquired by Harness in 2024 &middot; Redwood City, CA</p>

          <div className="mt-3 ml-4 border-l-2 border-gray-200 pl-4 space-y-6">
            <div>
              <p className="font-medium text-gray-800">Software Engineer &ndash; Measurement and Learning</p>
              <p className="text-sm text-gray-500">Dec 2022 &ndash; Jun 2024</p>
            </div>

            <div>
              <p className="font-medium text-gray-800">Software Engineer &ndash; Office of the CTO</p>
              <p className="text-sm text-gray-500">Aug 2021 &ndash; Dec 2022</p>
              <ul className="mt-2 list-disc list-inside text-gray-700 space-y-1 text-sm">
                <li>Created a proof of concept for ingestion of external feature flags into Split to enable experimentation</li>
                <li>Designed various OpenFeature providers to allow use of Split using OpenFeature&apos;s vendor agnostic SDKs. Built OpenFeature providers in Java, Go, Javascript, and Python</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Cisco */}
        <div className="mt-10">
          <h3 className="text-xl font-bold">Cisco</h3>
          <p className="text-xs text-gray-400 mt-0.5">San Jose, CA</p>

          <div className="mt-3 ml-4 border-l-2 border-gray-200 pl-4">
            <p className="font-medium text-gray-800">Software Engineer</p>
            <p className="text-sm text-gray-500">Jul 2020 &ndash; Aug 2021</p>
            <ul className="mt-2 list-disc list-inside text-gray-700 space-y-1 text-sm">
              <li>Developed full stack the Notification Center microservice used by Webex Control Hub</li>
              <li>Researched and quickly developed multiple PoCs for the use of ML in meeting quality alerting systems</li>
              <li>Lead development of a dynamic threshold based alerting application for bad meeting quality</li>
            </ul>
          </div>
        </div>

        {/* Sage Health */}
        <div className="mt-10">
          <h3 className="text-xl font-bold">Sage Health, Inc</h3>
          <p className="text-xs text-gray-400 mt-0.5">San Francisco, CA</p>

          <div className="mt-3 ml-4 border-l-2 border-gray-200 pl-4">
            <p className="font-medium text-gray-800">Data Science Consultant</p>
            <p className="text-sm text-gray-500">Nov 2018 &ndash; Aug 2019</p>
            <ul className="mt-2 list-disc list-inside text-gray-700 space-y-1 text-sm">
              <li>Designed memory efficient data management software to facilitate extraction of interesting and novel observations</li>
              <li>Generated useful metrics and graphs that provide creative insight into large sets of health care data</li>
            </ul>
          </div>
        </div>

        {/* Vitrium */}
        <div className="mt-10">
          <h3 className="text-xl font-bold">Vitrium Systems Inc.</h3>
          <p className="text-xs text-gray-400 mt-0.5">Prague, Czechia</p>

          <div className="mt-3 ml-4 border-l-2 border-gray-200 pl-4">
            <p className="font-medium text-gray-800">Software Engineer Intern</p>
            <p className="text-sm text-gray-500">Jun 2018 &ndash; Aug 2018</p>
            <ul className="mt-2 list-disc list-inside text-gray-700 space-y-1 text-sm">
              <li>Created software used to target advertisements to specific advertising demographics in real time</li>
              <li>Integrated OpenCV library with Microsoft Face API to create facial detection and recognition software</li>
              <li>Independently developed project from conceptual phase to preparation for deployment</li>
            </ul>
          </div>
        </div>
      </section>

      {/* --- Education --- */}
      <section className="mt-14">
        <h2 className="text-2xl font-semibold border-b pb-2">Education</h2>

        <div className="mt-6">
          <h3 className="text-xl font-bold">University of California, Berkeley</h3>
          <p className="font-medium text-gray-800 mt-1">B.S. Computer Science</p>
          <p className="text-sm text-gray-500">2016 &ndash; 2020</p>
          <p className="text-sm text-gray-600 mt-1">Certificate in Entrepreneurship and Technology</p>
        </div>
      </section>

      {/* --- Volunteering --- */}
      <section className="mt-14">
        <h2 className="text-2xl font-semibold border-b pb-2">Volunteering</h2>

        <div className="mt-6">
          <h3 className="text-xl font-bold">Camp Kesem Berkeley</h3>
          <div className="mt-1 ml-4 border-l-2 border-gray-200 pl-4">
            <p className="font-medium text-gray-800">Counselor</p>
            <p className="text-sm text-gray-500">Jan 2018 &ndash; May 2020</p>
          </div>
        </div>
      </section>
    </div>
  );
}
