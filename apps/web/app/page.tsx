import { SignInButton } from "@/components/sign-in-button";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import Link from "next/link";

const HomePage = async () => {
  const session = await auth.api.getSession({ headers: await headers() });

  return (
    <main className="home">
      <div className="card">
        <div className="gavel">🔨</div>
        <h1>Tribunal du Royaume</h1>
        <span className="sticker">Justice 100% corrompue</span>
        <p>La cour est corrompue, le juge aussi. Entrez, asseyez-vous, votez.</p>
        {session === null ? <SignInButton /> : <Link className="button" href="/room">Entrer dans la salle d'audience</Link>}
      </div>
    </main>
  );
};

export default HomePage;
