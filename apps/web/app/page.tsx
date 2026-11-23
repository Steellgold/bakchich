import { SignInButton } from "@/components/sign-in-button";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import Link from "next/link";

const HomePage = async () => {
  const session = await auth.api.getSession({ headers: await headers() });

  return (
    <main className="home">
      <h1>Tribunal du Royaume</h1>
      <p>La cour est corrompue, le juge aussi. Entrez, asseyez-vous, votez.</p>
      {session === null ? <SignInButton /> : <Link className="button" href="/room">Entrer dans la salle d'audience</Link>}
    </main>
  );
};

export default HomePage;
