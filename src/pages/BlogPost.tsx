import { ArrowLeft } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { Link, useParams } from 'react-router-dom'

import { Button } from '@/components/ui/button'

// Imports markdown raw via Vite. Pour ajouter un nouvel article :
// 1. Créer le fichier `src/blog/posts/<slug>.md`
// 2. L'ajouter dans la map `POSTS_CONTENT` ci-dessous
// 3. L'ajouter dans la liste `POSTS` de `Blog.tsx`
//
// Pas de glob dynamique ici par souci de tree-shaking et de prévisibilité.
import welcomeContent from '@/blog/posts/welcome.md?raw'

const POSTS_CONTENT: Record<string, string> = {
  welcome: welcomeContent,
}

export default function BlogPost(): React.ReactElement {
  const { slug } = useParams<{ slug: string }>()

  const content = slug !== undefined ? POSTS_CONTENT[slug] : undefined

  if (content === undefined) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-20 text-center sm:px-6">
        <h1 className="text-2xl font-semibold text-slate-900">Article à venir</h1>
        <p className="mt-3 text-slate-600">
          Cet article n'est pas encore publié. Revenez bientôt — nous publions régulièrement des
          notes produit, post-mortems techniques et études de cas.
        </p>
        <Button asChild variant="outline" className="mt-6 gap-2">
          <Link to="/blog">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Retour au blog
          </Link>
        </Button>
      </div>
    )
  }

  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <Button asChild variant="ghost" size="sm" className="mb-6 gap-2 text-slate-600">
        <Link to="/blog">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Retour au blog
        </Link>
      </Button>
      <div className="markdown-body flex flex-col gap-4 text-slate-700">
        <ReactMarkdown
          components={{
            h1: ({ children }) => (
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                {children}
              </h1>
            ),
            h2: ({ children }) => (
              <h2 className="mt-6 text-2xl font-semibold tracking-tight text-slate-900">
                {children}
              </h2>
            ),
            h3: ({ children }) => (
              <h3 className="mt-4 text-xl font-semibold tracking-tight text-slate-900">
                {children}
              </h3>
            ),
            p: ({ children }) => <p className="leading-relaxed">{children}</p>,
            a: ({ children, href }) => (
              <a
                href={href}
                className="text-emerald-700 underline-offset-2 hover:underline"
                target={href?.startsWith('http') ? '_blank' : undefined}
                rel={href?.startsWith('http') ? 'noreferrer' : undefined}
              >
                {children}
              </a>
            ),
            strong: ({ children }) => (
              <strong className="font-semibold text-slate-900">{children}</strong>
            ),
            em: ({ children }) => <em className="text-slate-600">{children}</em>,
            ul: ({ children }) => <ul className="list-disc space-y-1 pl-6">{children}</ul>,
            ol: ({ children }) => <ol className="list-decimal space-y-1 pl-6">{children}</ol>,
            code: ({ children }) => (
              <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-sm">{children}</code>
            ),
            blockquote: ({ children }) => (
              <blockquote className="border-l-4 border-slate-200 pl-4 text-slate-600 italic">
                {children}
              </blockquote>
            ),
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </article>
  )
}
