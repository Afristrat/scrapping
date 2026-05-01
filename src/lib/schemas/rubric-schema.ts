import { z } from 'zod'

export const criterionSchema = z.object({
  label: z.string().min(1, 'Label requis').max(100),
  weight: z.number().min(0).max(1),
})

export type Criterion = z.infer<typeof criterionSchema>

export const rubricSchema = z.object({
  name: z.string().min(1, 'Nom requis').max(100),
  description: z.string().max(500),
  prompt: z.string().min(10, 'Prompt trop court').max(5000),
  criteria: z.array(criterionSchema).min(1, 'Au moins 1 critere'),
  is_default: z.boolean(),
})

export type RubricFormValues = z.infer<typeof rubricSchema>

export interface ScoringRubric {
  id: string
  user_id: string
  name: string
  description: string | null
  prompt: string
  criteria: Criterion[]
  is_default: boolean
}
