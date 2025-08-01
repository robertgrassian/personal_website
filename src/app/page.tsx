import Image from "next/image";

export default function Home() {
  return (
    <div>
      <h1 className="text-3xl font-bold underline">Welcome to My Page</h1>
      <p className="mt-4 text-lg">
        I really love my girlfriend Pao and its national GF day tomorrow!!!
      </p>
      <ul className="mt-4 list-disc list-inside text-lg">
        <li>She is incredibly kind and caring</li>
        <li>She always makes me laugh</li>
        <li>She supports me in everything I do</li>
        <li>She is thoughtful and understanding</li>
        <li>She inspires me to be a better person</li>
      </ul>

    </div>
  );
}
