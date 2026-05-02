import { ArrowRight, Calendar, Clock, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface BlogPostMeta {
  slug: string
  title: string
  excerpt: string
  date: string
  readingTime: string
  tag: 'Produit' | 'Technique' | 'Stratégie' | 'Cas client'
  status: 'published' | 'coming-soon'
}

const POSTS: BlogPostMeta[] = [
  {
    slug: 'welcome',
    title: 'Bienvenue dans Kairos — la veille IA qui comprend vos critères',
    excerpt:
      'Lancement public, philosophie produit, BYOK 10 providers, mémoire 90 à 365 jours. Le manifeste qui explique pourquoi nous repensons la veille IA depuis la base — pas avec des mots-clés, mais avec un LLM qui score selon VOS rubriques.',
    date: '1er mai 2026',
    readingTime: '4 min',
    tag: 'Produit',
    status: 'published',
  },
  {
    slug: 'why-vite-not-nextjs',
    title: 'Pourquoi nous avons choisi Vite plutôt que Next.js (et pourquoi ça compte)',
    excerpt:
      "Post-mortem technique de notre choix de stack : 400 ms de build vs 30-60 s, pas de Server Components à arbitrer, et un déploiement static sur n'importe quelle infra. Quand Next.js est-il vraiment nécessaire ?",
    date: 'À venir',
    readingTime: '8 min',
    tag: 'Technique',
    status: 'coming-soon',
  },
  {
    slug: 'scoring-llm-vs-keywords',
    title: 'Scoring LLM vs mots-clés : 6 mois de benchmarks sur 50 000 signaux',
    excerpt:
      'Nous avons comparé un scoring par mots-clés classiques à un scoring LLM custom (Sonnet 4.5) sur 50 000 signaux X + Reddit + arXiv. Résultats : 3,2x moins de faux positifs, 1,8x plus de signaux faibles détectés.',
    date: 'À venir',
    readingTime: '12 min',
    tag: 'Stratégie',
    status: 'coming-soon',
  },
  {
    slug: 'cascade-transversale',
    title: 'La cascade transversale : comment relier X, Reddit et arXiv automatiquement',
    excerpt:
      'Un tweet pointe vers un paper. Le paper est cité dans un subreddit. Le subreddit nomme un nouvel auteur. Comment Kairos suit ce fil sans intervention humaine — implémentation, prompt, et limites actuelles.',
    date: 'À venir',
    readingTime: '10 min',
    tag: 'Technique',
    status: 'coming-soon',
  },
]

export default function Blog(): React.ReactElement {
  return (
    <div className="bg-white">
      <section className="border-b border-slate-100 bg-gradient-to-b from-slate-50 to-white">
        <div className="mx-auto w-full max-w-4xl px-4 py-16 sm:px-6 sm:py-20">
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Blog Kairos
          </span>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl">
            Notes produit, post-mortems techniques et analyses de tendances IA.
          </h1>
          <p className="mt-4 text-lg text-slate-600">
            Nous publions ici les coulisses de Kairos : pourquoi nous avons fait tel choix, ce que
            nos signaux nous apprennent sur le marché de l'IA, et les retours d'expérience de nos
            clients.
          </p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="mb-8 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <strong>Coming soon</strong> — nous démarrons doucement avec un seul article publié. Les
          autres titres ci-dessous arrivent dans les semaines à venir. Inscrivez-vous à la
          newsletter (lien à venir) pour ne rien rater.
        </div>

        <ul className="flex flex-col gap-8">
          {POSTS.map((post) => {
            const isPublished = post.status === 'published'
            return (
              <li
                key={post.slug}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md sm:p-8"
              >
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                  <Badge variant="secondary">{post.tag}</Badge>
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                    {post.date}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                    {post.readingTime}
                  </span>
                  {!isPublished ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">
                      À paraître
                    </span>
                  ) : null}
                </div>
                <h2 className="mt-3 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
                  {isPublished ? (
                    <Link to={`/blog/${post.slug}`} className="hover:text-emerald-700">
                      {post.title}
                    </Link>
                  ) : (
                    <span className="text-slate-700">{post.title}</span>
                  )}
                </h2>
                <p className="mt-3 text-sm text-slate-600 sm:text-base">{post.excerpt}</p>
                <div className="mt-4">
                  {isPublished ? (
                    <Button asChild variant="outline" size="sm" className="gap-2">
                      <Link to={`/blog/${post.slug}`}>
                        Lire l'article
                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      </Link>
                    </Button>
                  ) : (
                    <span className="text-sm text-slate-500 italic">
                      Publication prévue prochainement.
                    </span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
