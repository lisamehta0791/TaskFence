import { describe, expect, it } from 'vitest'
import { deriveFormFromText, looksLikeAForm, slugify, stripOfficeSection } from './deriveForm'

const JOB_FORM = `
MERIDIAN LABS — APPLICATION FORM

Personal
Full name: ______________
Email address: __________
Date of birth: __________

Experience
Current job title: _______
Years of experience: _____
Key skills: ______________

Terms
Salary expectation: £_____
Notice period: ___________
Right to work (optional): _

Why do you want this role?
`

const COMPETITION = `
NATIONAL ROBOTICS CHALLENGE 2026 — ENTRY

Team
Team name: Kestrel
Institution: ___________
Number of members: _____

Project
Project title: _________
Describe your project: _
Budget requested: ______
`

const CV = `
AMARA OKONJO — CURRICULUM VITAE
Location: Bristol, UK
Current job title: Backend Engineer
Years of experience: 4
Key skills: TypeScript, PostgreSQL
`

describe('slugify', () => {
  it('makes a stable field id from a label', () => {
    expect(slugify('Full name')).toBe('fullName')
    expect(slugify('Date of birth')).toBe('dateOfBirth')
    expect(slugify('Right to work (optional)')).toBe('rightToWork')
  })

  it('returns nothing for a label with no letters', () => {
    expect(slugify('___')).toBe('')
  })
})

describe('deriving a form from a blank application', () => {
  const derived = deriveFormFromText(JOB_FORM)

  it('finds the fields', () => {
    const ids = derived.fields.map((f) => f.id)
    expect(ids).toContain('fullName')
    expect(ids).toContain('salaryExpectation')
    expect(ids).toContain('noticePeriod')
    expect(ids).toContain('yearsOfExperience')
  })

  it('groups them under the headings in the document', () => {
    const byId = Object.fromEntries(derived.fields.map((f) => [f.id, f]))
    expect(byId.fullName.group).toBe('Personal')
    expect(byId.currentJobTitle.group).toBe('Experience')
    expect(byId.salaryExpectation.group).toBe('Terms')
  })

  it('works out what kind of value each field wants', () => {
    const byId = Object.fromEntries(derived.fields.map((f) => [f.id, f]))
    expect(byId.dateOfBirth.type).toBe('date')
    expect(byId.salaryExpectation.type).toBe('money')
    expect(byId.yearsOfExperience.type).toBe('number')
  })

  it('treats underscores as blank, not as an answer', () => {
    expect(derived.answers.fullName).toBeUndefined()
    expect(Object.keys(derived.answers)).toHaveLength(0)
  })

  it('respects "optional"', () => {
    const byId = Object.fromEntries(derived.fields.map((f) => [f.id, f]))
    expect(byId.rightToWork.required).toBe(false)
    expect(byId.fullName.required).toBe(true)
  })

  it('picks up a question as a long-answer field', () => {
    const why = derived.fields.find((f) => f.id.startsWith('whyDoYou'))
    expect(why).toBeDefined()
    expect(why?.type).toBe('textarea')
  })

  it('recognises it as a form to fill in', () => {
    expect(looksLikeAForm(derived)).toBe(true)
  })
})

describe('a completely different kind of form', () => {
  const derived = deriveFormFromText(COMPETITION)

  it('derives a competition entry just as well as a job application', () => {
    const ids = derived.fields.map((f) => f.id)
    expect(ids).toContain('teamName')
    expect(ids).toContain('projectTitle')
    expect(ids).toContain('budgetRequested')
    expect(ids).toContain('numberOfMembers')
  })

  it('keeps what the document already answers as material, not as an answer', () => {
    // "Team name: Kestrel" is filled in, so it is available to the agent...
    expect(derived.answers.teamName).toBe('Kestrel')
    // ...but it is still a field on the form, which the rules then govern.
    expect(derived.fields.some((f) => f.id === 'teamName')).toBe(true)
  })

  it('types the free-text and money fields correctly', () => {
    const byId = Object.fromEntries(derived.fields.map((f) => [f.id, f]))
    expect(byId.describeYourProject.type).toBe('textarea')
    expect(byId.budgetRequested.type).toBe('money')
  })
})

describe('a document that is a source, not a form', () => {
  const derived = deriveFormFromText(CV)

  it('still reads its values out', () => {
    expect(derived.answers.location).toBe('Bristol, UK')
    expect(derived.answers.currentJobTitle).toBe('Backend Engineer')
  })

  it('does not pretend it is a blank form', () => {
    expect(looksLikeAForm(derived)).toBe(false)
  })
})

describe('printed-form style, no colons', () => {
  // Real PDF forms often print "Full name ________" with no colon at all.
  it('reads a label followed by a write-on-this line', () => {
    const derived = deriveFormFromText('Full name ____________\nNationality ____________\nDate of birth ……………')
    const ids = derived.fields.map((f) => f.id)
    expect(ids).toContain('fullName')
    expect(ids).toContain('nationality')
    expect(ids).toContain('dateOfBirth')
    // All blanks — nothing counted as an answer.
    expect(Object.keys(derived.answers)).toHaveLength(0)
  })

  it('does not mistake a divider line for a field', () => {
    expect(deriveFormFromText('____________________').fields).toHaveLength(0)
  })
})

describe('robustness', () => {
  it('returns nothing for prose', () => {
    const derived = deriveFormFromText(
      'The quick brown fox jumped over the lazy dog. It was a fine afternoon and nothing much happened.',
    )
    expect(derived.fields).toHaveLength(0)
  })

  it('handles an empty document', () => {
    expect(deriveFormFromText('').fields).toHaveLength(0)
  })

  it('never repeats a field', () => {
    const derived = deriveFormFromText('Name: ___\nName: ___\nName: ___')
    expect(derived.fields).toHaveLength(1)
  })

  it('caps how many fields one document can create', () => {
    const many = Array.from({ length: 80 }, (_, i) => `Field ${i}: ___`).join('\n')
    expect(deriveFormFromText(many).fields.length).toBeLessThanOrEqual(40)
  })

  it('ignores page furniture', () => {
    const derived = deriveFormFromText('Page 2\nInstructions: read carefully\nName: ___')
    expect(derived.fields.map((f) => f.id)).toEqual(['name'])
  })

  it('stops at the section the office fills in, not the applicant', () => {
    const derived = deriveFormFromText('Name: ___\nFor office use only:\nVerified by: ___\nOutcome: ___')
    expect(derived.fields.map((f) => f.id)).toEqual(['name'])
  })
})

describe('stripOfficeSection', () => {
  it('removes everything from the office heading onwards', () => {
    const text = ['Name: ___', 'FOR OFFICE PURPOSE ONLY', 'Verified by: ___'].join('\n')
    expect(stripOfficeSection(text)).toBe('Name: ___')
  })

  it('leaves a document with no such section untouched', () => {
    const text = ['Name: ___', 'Email: ___'].join('\n')
    expect(stripOfficeSection(text)).toBe(text)
  })
})
