import type { DomainSpec } from './types'

/**
 * A scholarship application.
 *
 * This is the walkthrough in the project document and the one recorded for the
 * demo video — but note that it is *only config*. Its record store and all
 * seven of its WebMCP tools are generated from this object by the same factory
 * every other workspace uses. Nothing about TaskFence is scholarship-shaped.
 *
 * All data is fictional. No real people, institutions or payments.
 */
export const scholarshipDomain: DomainSpec = {
  id: 'scholarship',
  route: '/demo',
  taskTitle: 'Example · scholarship',
  subject: 'application',
  blurb: 'A part-filled application, your documents, and answers you do not want touched.',

  readTools: ['getApplication', 'getRequirements', 'listDocuments', 'readDocument', 'checkApplication'],
  writeTools: ['updateApplication'],
  uploadTools: ['uploadDocument'],
  submitTools: ['submitApplication'],
  deleteTools: [],
  // Order matters: the tool factory reads these positionally.
  allTools: [
    'getApplication',
    'getRequirements',
    'listDocuments',
    'readDocument',
    'uploadDocument',
    'updateApplication',
    'submitApplication',
    'checkApplication',
  ],
  irreversibleTools: ['submitApplication'],
  operationOf: {
    getApplication: 'READ',
    getRequirements: 'READ',
    listDocuments: 'READ',
    readDocument: 'READ',
    uploadDocument: 'UPLOAD',
    updateApplication: 'WRITE',
    submitApplication: 'SUBMIT',
    checkApplication: 'READ',
  },

  fields: [
    { id: 'fullName', label: 'Full name', type: 'text', group: 'Applicant', required: true },
    { id: 'email', label: 'Email address', type: 'text', group: 'Applicant', required: true },
    { id: 'dateOfBirth', label: 'Date of birth', type: 'date', group: 'Applicant', required: true },
    {
      id: 'previousUniversity',
      label: 'Previous institution',
      type: 'text',
      group: 'Education',
      required: true,
      help: 'The last school or college you attended.',
    },
    { id: 'degreeProgram', label: 'Degree programme', type: 'text', group: 'Education', required: true },
    { id: 'gpa', label: 'Grade average', type: 'text', group: 'Education', required: true },
    {
      id: 'expectedGraduation',
      label: 'Expected graduation',
      type: 'text',
      group: 'Education',
      required: true,
      placeholder: 'e.g. June 2027',
    },
    {
      id: 'familyIncome',
      label: 'Annual household income',
      type: 'money',
      group: 'Financial need',
      required: true,
      help: 'Used only to assess need. Simulated data in this demo.',
    },
    { id: 'dependents', label: 'People in household', type: 'number', group: 'Financial need', required: true },
    { id: 'fundingGap', label: 'Funding still needed', type: 'money', group: 'Financial need', required: true },
    {
      id: 'personalStatement',
      label: 'Personal statement',
      type: 'textarea',
      group: 'Statement',
      required: true,
      help: 'Why this scholarship matters to you.',
    },
    { id: 'refereeEmail', label: 'Referee email', type: 'text', group: 'Statement', required: false },
  ],

  exampleStatement:
    "Complete my scholarship application using my documents. Don't change anything I've already answered. If something is missing, ask me. Ask before you submit.",
  altStatements: [
    'Fill in the blanks from my documents but do not submit anything, and never edit what I already wrote.',
    'Just read my application and tell me what is missing. Do not change anything.',
    'Complete everything from my documents and submit it when it is ready.',
  ],

  form: {
    noun: 'application',
    title: 'Horizon Futures Scholarship',
    subtitle: 'Application 2026 · all data on this page is fictional',

    // Values already here are the human's own answers — the ones the agent
    // must not quietly "correct". Blanks are what it is there to fill.
    seed: {
      fullName: 'Amara Okonjo',
      email: 'amara.okonjo@example.edu',
      dateOfBirth: '2004-03-14',
      previousUniversity: 'Riverside Community College',
      degreeProgram: 'BSc Computer Science',
      gpa: '',
      expectedGraduation: '',
      familyIncome: '',
      dependents: '',
      fundingGap: '',
      personalStatement:
        'I want to build software that makes public services easier to use for people who are usually designed around, not designed for.',
      refereeEmail: '',
    },

    requirements: [
      {
        id: 'req_identity',
        title: 'Verified identity',
        detail: 'Full name and date of birth must match an official document.',
        fields: ['fullName', 'dateOfBirth'],
      },
      {
        id: 'req_academic',
        title: 'Academic standing',
        detail: 'Previous institution, grade average and expected graduation date are required.',
        fields: ['previousUniversity', 'gpa', 'expectedGraduation'],
      },
      {
        id: 'req_need',
        title: 'Demonstrated financial need',
        detail: 'Household income, household size and the remaining funding gap are required.',
        fields: ['familyIncome', 'dependents', 'fundingGap'],
      },
      {
        id: 'req_statement',
        title: 'Personal statement',
        detail: 'A short statement in the applicant’s own words. Never written by an agent.',
        fields: ['personalStatement'],
      },
    ],

    /**
     * Sample documents so the demo works with zero setup. Their text is real
     * text — the same extraction path an uploaded PDF goes through reads it.
     * Delete them and upload your own; the agent will read yours instead.
     */
    documents: [
      {
        id: 'doc_transcript',
        name: 'sample-academic-transcript.txt',
        kind: 'text',
        sizeKb: 2,
        origin: 'sample',
        readable: true,
        summary: 'Sample transcript: grade average, graduation date and previous institution.',
        text: [
          'NORTHGATE STATE UNIVERSITY — OFFICIAL ACADEMIC TRANSCRIPT',
          'Name: Amara Okonjo',
          'Institution: Northgate State University',
          'Programme: BSc Computer Science',
          'GPA: 3.82 / 4.0',
          'Expected graduation: June 2027',
          'Credits completed: 96 of 120',
        ].join('\n'),
        extracted: {
          previousUniversity: 'Northgate State University',
          gpa: '3.82 / 4.0',
          expectedGraduation: 'June 2027',
          degreeProgram: 'BSc Computer Science',
        },
      },
      {
        id: 'doc_income',
        name: 'sample-household-income.txt',
        kind: 'text',
        sizeKb: 1,
        origin: 'sample',
        readable: true,
        summary: 'Sample income statement: household income and household size.',
        text: [
          'HOUSEHOLD INCOME STATEMENT — TAX YEAR 2025',
          'Household income: 31,400',
          'People in household: 5',
          'Funding gap declared: none on file',
        ].join('\n'),
        extracted: { familyIncome: '31,400', dependents: '5' },
      },
      {
        id: 'doc_id',
        name: 'sample-student-id.png',
        kind: 'image',
        sizeKb: 402,
        origin: 'sample',
        readable: false,
        note: 'This is an image. TaskFence does not run OCR, so an agent cannot read it and will have to ask you what it says.',
        summary: 'Student identity card. Unreadable by design — shows what happens when an agent cannot read a file.',
        extracted: {},
      },
    ],
  },
}
