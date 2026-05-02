import { HelpCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

export function TopicHelpDialog(): React.ReactElement {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          aria-label="Comment lire cette page"
        >
          <HelpCircle className="h-3.5 w-3.5" />
          Comment lire cette page
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Comprendre la page Topics</DialogTitle>
          <DialogDescription>
            Cette page transforme tes signaux scrapés en thèmes exploitables, et te dit lesquels
            méritent ton attention maintenant.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm leading-relaxed">
          <section>
            <h3 className="font-semibold mb-1">Qu&apos;est-ce qu&apos;un topic ?</h3>
            <p className="text-muted-foreground">
              Un topic est un regroupement thématique de tes signaux (X, Reddit, ArXiv) détecté
              automatiquement par le LLM. Plutôt que de lire des centaines de posts, tu vois quels
              <em> sujets</em> reviennent et lesquels prennent de l&apos;ampleur.
            </p>
          </section>

          <section>
            <h3 className="font-semibold mb-1">Comment lire le z-score ?</h3>
            <p className="text-muted-foreground">
              Le z-score mesure à quel point la fréquence du topic au dernier run s&apos;écarte de
              sa baseline historique (moyenne ± écart-type des runs précédents).
            </p>
            <ul className="mt-2 ml-4 list-disc space-y-1 text-muted-foreground">
              <li>
                <span className="font-mono text-foreground">z &gt; 2</span> : pic anormal, le sujet
                sort du bruit habituel — opportunité à investiguer.
              </li>
              <li>
                <span className="font-mono text-foreground">-2 ≤ z ≤ 2</span> : variation normale,
                le sujet est dans sa baseline habituelle.
              </li>
              <li>
                <span className="font-mono text-foreground">z &lt; -2</span> : chute anormale, le
                sujet retombe — peut signaler une mode passagère.
              </li>
            </ul>
          </section>

          <section>
            <h3 className="font-semibold mb-1">Que faire de chaque catégorie ?</h3>
            <ul className="ml-4 list-disc space-y-1 text-muted-foreground">
              <li>
                <strong className="text-foreground">Émergents</strong> : explore les signaux du
                topic, identifie ce qui change, considère un contenu / produit autour.
              </li>
              <li>
                <strong className="text-foreground">En déclin</strong> : sujet en perte de
                vitesse — utile pour dé-prioriser une feature ou couper une roadmap.
              </li>
              <li>
                <strong className="text-foreground">Stables</strong> : baseline normale, à garder à
                l&apos;œil sans urgence.
              </li>
              <li>
                <strong className="text-foreground">En calibrage</strong> : moins de 10 runs
                d&apos;historique, pas assez de données pour juger. Continue à laisser tourner le
                pipeline.
              </li>
            </ul>
          </section>
        </div>

        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  )
}
