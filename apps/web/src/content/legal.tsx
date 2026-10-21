/**
 * Privacy policy and terms of use, written for what the app actually does
 * (see docs/operations/privacy.md for the reasoning). Plain JSX per locale:
 * long legal text reads better in context than as translation keys.
 */
import { REMOVAL_GRACE_DAYS } from "@/lib/data/rules";
import { REPO_URL } from "@/lib/site";

export const LEGAL_UPDATED = "2026-10-21";

function Contact({ locale }: { locale: string }) {
  const email = process.env.NEXT_PUBLIC_CONTACT_EMAIL;
  if (email) return <a href={`mailto:${email}`}>{email}</a>;
  return <a href={`${REPO_URL}/issues`}>{locale === "fr" ? "les tickets du projet sur GitHub" : "the project's GitHub issues"}</a>;
}

export function PrivacyContent({ locale }: { locale: string }) {
  if (locale === "fr") {
    return (
      <>
        <p>
          GeoLausanne est un projet communautaire à code ouvert. Cette page explique quelles données sont traitées, pourquoi et
          combien de temps, conformément à la loi fédérale sur la protection des données (nLPD) et, pour les visites depuis
          l’Union européenne, au RGPD. Contact pour toute question ou demande : <Contact locale={locale} />.
        </p>
        <h2>Sans compte</h2>
        <ul>
          <li>Aucune publicité, aucun outil de mesure d’audience, aucun pistage.</li>
          <li>
            Votre navigateur conserve localement votre choix d’apparence et, en mode démo, vos données de test. Un cookie technique
            mémorise votre langue.
          </li>
          <li>
            Votre position (bouton « Ma position ») est utilisée uniquement dans votre navigateur pour déplacer la carte ; elle
            n’est envoyée nulle part, sauf si vous l’utilisez comme emplacement d’une nouvelle adresse.
          </li>
          <li>
            La recherche de rues et l’adresse d’un emplacement choisi sont demandées à l’API publique de swisstopo
            (api3.geo.admin.ch) : le texte recherché ou les coordonnées lui sont transmis.
          </li>
          <li>
            Nos hébergeurs (Vercel pour le site, Cloudflare pour la ville 3D, Supabase pour la base de données) enregistrent les
            adresses IP dans leurs journaux techniques pour assurer la sécurité et le fonctionnement du service.
          </li>
        </ul>
        <h2>Avec un compte</h2>
        <ul>
          <li>
            Votre adresse e-mail sert uniquement à vous envoyer des liens de connexion. Elle n’est jamais affichée publiquement.
          </li>
          <li>
            Votre nom affiché est un pseudonyme (par défaut « member-… ») que vous pouvez modifier ; il apparaît à côté de vos
            adresses et de vos avis.
          </li>
          <li>
            Vos contributions : adresses ajoutées, avis (publics), votes (seuls les totaux sont publics) et signalements (visibles
            uniquement par la modération).
          </li>
          <li>
            Si vous choisissez la connexion via Google ou GitHub, ce service vous identifie et nous transmet votre adresse
            e-mail. Si la protection anti-robots est activée, Cloudflare Turnstile analyse le formulaire de connexion.
          </li>
        </ul>
        <h2>Durée de conservation</h2>
        <ul>
          <li>Les données de compte et les contributions sont conservées tant que le compte existe.</li>
          <li>Une adresse retirée par la communauté est définitivement supprimée après {REMOVAL_GRACE_DAYS} jours.</li>
          <li>Les journaux techniques sont conservés selon les règles de chaque hébergeur (en général quelques jours à semaines).</li>
        </ul>
        <h2>Où sont les données</h2>
        <p>
          La base de données est hébergée par Supabase dans l’Union européenne (Francfort). Le site et la ville 3D sont servis par
          les réseaux mondiaux de Vercel et Cloudflare. Ces prestataires sont liés par des clauses contractuelles de protection
          des données.
        </p>
        <h2>Vos droits</h2>
        <p>
          Vous pouvez demander l’accès à vos données, leur rectification ou leur suppression, ainsi que la suppression de votre
          compte, en écrivant à <Contact locale={locale} />. Vos avis et vos votes sont supprimés avec le compte ; les adresses que
          vous avez ajoutées restent sur la carte sous forme anonyme, car elles appartiennent à la base de données ouverte décrite
          dans les conditions d’utilisation.
        </p>
      </>
    );
  }
  return (
    <>
      <p>
        GeoLausanne is an open-source community project. This page explains which data is processed, why and for how long, in
        line with the Swiss Federal Act on Data Protection (FADP) and, for visits from the European Union, the GDPR. Questions
        and requests: <Contact locale={locale} />.
      </p>
      <h2>Without an account</h2>
      <ul>
        <li>No advertising, no audience measurement, no tracking.</li>
        <li>
          Your browser stores your appearance choice and, in demo mode, your test data locally. A technical cookie remembers your
          language.
        </li>
        <li>
          Your position (the “Go to my location” button) is only used in your browser to move the map; it is not sent anywhere
          unless you use it as the location of a new spot.
        </li>
        <li>
          Street search and the address of a chosen location are requested from swisstopo’s public API (api3.geo.admin.ch): the
          search text or the coordinates are sent to it.
        </li>
        <li>
          Our hosting providers (Vercel for the website, Cloudflare for the 3D city, Supabase for the database) record IP
          addresses in their technical logs to keep the service secure and running.
        </li>
      </ul>
      <h2>With an account</h2>
      <ul>
        <li>Your e-mail address is only used to send you sign-in links. It is never shown publicly.</li>
        <li>
          Your display name is a pseudonym (by default “member-…”) that you can change; it appears next to your spots and
          reviews.
        </li>
        <li>
          Your contributions: spots you add, reviews (public), votes (only totals are public) and reports (only visible to
          moderators).
        </li>
        <li>
          If you sign in with Google or GitHub, that service identifies you and shares your e-mail address with us. When bot
          protection is enabled, Cloudflare Turnstile checks the sign-in form.
        </li>
      </ul>
      <h2>How long data is kept</h2>
      <ul>
        <li>Account data and contributions are kept for as long as the account exists.</li>
        <li>A spot removed by the community is deleted for good after {REMOVAL_GRACE_DAYS} days.</li>
        <li>Technical logs are kept according to each provider’s rules (usually days to weeks).</li>
      </ul>
      <h2>Where the data is</h2>
      <p>
        The database is hosted by Supabase in the European Union (Frankfurt). The website and the 3D city are served by the
        global networks of Vercel and Cloudflare. These providers are bound by contractual data-protection clauses.
      </p>
      <h2>Your rights</h2>
      <p>
        You can ask for access to your data, its correction or deletion, and for your account to be deleted, by writing to{" "}
        <Contact locale={locale} />. Your reviews and votes are deleted with the account; spots you added stay on the map
        anonymously, as they are part of the open database described in the terms of use.
      </p>
    </>
  );
}

export function TermsContent({ locale }: { locale: string }) {
  if (locale === "fr") {
    return (
      <>
        <p>En utilisant GeoLausanne, vous acceptez les règles suivantes. Elles visent une carte utile, honnête et respectueuse.</p>
        <h2>Ce que la carte promet (et ne promet pas)</h2>
        <ul>
          <li>
            Les informations proviennent de la communauté et d’OpenStreetMap. Elles peuvent être incomplètes ou fausses : vérifiez
            toujours le statut halal sur place.
          </li>
          <li>
            Les votes reflètent la confiance de la communauté, pas une certification. Seul un certificat d’un organisme reconnu,
            vérifié par la modération, est signalé comme tel.
          </li>
          <li>Le service est fourni gratuitement, tel quel, sans garantie de disponibilité.</li>
        </ul>
        <h2>Contribuer</h2>
        <ul>
          <li>Ajoutez uniquement des lieux réels, à leur emplacement réel, avec des informations que vous pensez exactes.</li>
          <li>Pas de contenu publicitaire, haineux, diffamatoire ou contraire à la loi ; pas de faux votes ni de comptes multiples.</li>
          <li>
            Les faits que vous ajoutez (nom, emplacement, horaires…) sont publiés sous{" "}
            <a href="https://opendatacommons.org/licenses/odbl/1-0/">Open Database License 1.0</a>, comme les données
            OpenStreetMap qu’ils complètent. Vos avis restent les vôtres ; vous nous autorisez à les afficher.
          </li>
        </ul>
        <h2>Modération</h2>
        <ul>
          <li>
            Une adresse est retirée automatiquement lorsque la communauté la juge fausse ; la modération peut la rétablir pendant{" "}
            {REMOVAL_GRACE_DAYS} jours.
          </li>
          <li>La modération peut masquer des avis, retirer des adresses et suspendre des comptes qui ne respectent pas ces règles.</li>
          <li>
            Pour contester une décision ou signaler un contenu illicite, utilisez « Signaler un problème » ou écrivez à{" "}
            <Contact locale={locale} />.
          </li>
        </ul>
        <h2>Données géographiques</h2>
        <p>
          La ville 3D est dérivée des géodonnées de swisstopo (© swisstopo) et d’OpenStreetMap (© contributeurs OpenStreetMap,
          ODbL). Le code source est publié sous licence MIT : <a href={REPO_URL}>{REPO_URL.replace("https://", "")}</a>.
        </p>
      </>
    );
  }
  return (
    <>
      <p>By using GeoLausanne you accept the following rules. They aim for a map that is useful, honest and respectful.</p>
      <h2>What the map promises (and does not)</h2>
      <ul>
        <li>
          Information comes from the community and from OpenStreetMap. It can be incomplete or wrong: always check the halal
          status on site.
        </li>
        <li>
          Votes reflect community trust, not certification. Only a certificate from a recognised body, checked by moderators, is
          shown as such.
        </li>
        <li>The service is provided free of charge, as is, without any guarantee of availability.</li>
      </ul>
      <h2>Contributing</h2>
      <ul>
        <li>Only add real places, at their real location, with information you believe to be accurate.</li>
        <li>No advertising, hateful, defamatory or unlawful content; no fake votes or multiple accounts.</li>
        <li>
          The facts you add (name, location, opening hours…) are published under the{" "}
          <a href="https://opendatacommons.org/licenses/odbl/1-0/">Open Database License 1.0</a>, like the OpenStreetMap data
          they complement. Your reviews remain yours; you allow us to display them.
        </li>
      </ul>
      <h2>Moderation</h2>
      <ul>
        <li>
          A spot is removed automatically when the community judges it wrong; moderators can restore it within{" "}
          {REMOVAL_GRACE_DAYS} days.
        </li>
        <li>Moderators can hide reviews, remove spots and suspend accounts that break these rules.</li>
        <li>
          To challenge a decision or report unlawful content, use “Report a problem” or write to <Contact locale={locale} />.
        </li>
      </ul>
      <h2>Geodata</h2>
      <p>
        The 3D city is derived from swisstopo geodata (© swisstopo) and OpenStreetMap (© OpenStreetMap contributors, ODbL). The
        source code is MIT licensed: <a href={REPO_URL}>{REPO_URL.replace("https://", "")}</a>.
      </p>
    </>
  );
}
