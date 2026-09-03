/**
 * Format checking.
 *
 * The instruction that prompted this was "say if any field are wrong and not
 * matching proper standard format" — which the compiler used to understand as
 * precisely nothing. The values below are the real ones off a half-filled
 * scholarship form.
 */

import { describe, expect, it } from 'vitest'
import { checkRecordValues, checkValue, describeProblem } from './format'
import type { FieldSpec } from '../domains/types'

const field = (over: Partial<FieldSpec> & { id: string; label: string }): FieldSpec => ({
  type: 'text',
  group: 'Details',
  required: true,
  ...over,
})

const values = (v: Record<string, string>) =>
  Object.fromEntries(Object.entries(v).map(([k, value]) => [k, { value }]))

describe('checkValue', () => {
  it('says nothing about a blank field — missing is not malformed', () => {
    expect(checkValue(field({ id: 'emailId', label: 'Email Id' }), '')).toBeNull()
    expect(checkValue(field({ id: 'emailId', label: 'Email Id' }), '   ')).toBeNull()
  })

  it('catches an email address that is not one', () => {
    const p = checkValue(field({ id: 'emailId', label: 'Email Id' }), 'lisamehts')
    expect(p?.severity).toBe('error')
    expect(p?.problem).toMatch(/valid email/i)
  })

  it('accepts a real email address', () => {
    expect(checkValue(field({ id: 'emailId', label: 'Email Id' }), 'lisa@example.edu')).toBeNull()
  })

  it('catches a phone number made of letters', () => {
    const p = checkValue(field({ id: 'mobileNumber', label: 'Mobile Number' }), 'dvbnhgfdsa')
    expect(p?.severity).toBe('error')
    expect(p?.problem).toMatch(/letters|digits/i)
  })

  it('catches a phone number with letters mixed into it', () => {
    expect(checkValue(field({ id: 'whatsappNumber', label: 'WhatsApp Number' }), 'qwertyuiopo987')).not.toBeNull()
  })

  it('accepts a plausible phone number in any local format', () => {
    expect(checkValue(field({ id: 'mobileNumber', label: 'Mobile Number' }), '+91 98765 43210')).toBeNull()
    expect(checkValue(field({ id: 'parentMobile', label: 'Parent Mobile Number' }), '12345678')).toBeNull()
  })

  it('catches a date that is not a date, and accepts one that is', () => {
    expect(checkValue(field({ id: 'dob', label: 'Date of Birth', type: 'date' }), 'sometime')).not.toBeNull()
    expect(checkValue(field({ id: 'dob', label: 'Date of Birth', type: 'date' }), '01 / 09 / 2007')).toBeNull()
    expect(checkValue(field({ id: 'grad', label: 'Expected graduation', type: 'date' }), 'June 2027')).toBeNull()
  })

  it('catches a printed blank line left sitting in the answer', () => {
    const p = checkValue(field({ id: 'nameOfProgram', label: 'Name of Program' }), '______ ___________')
    expect(p?.severity).toBe('error')
    expect(p?.problem).toMatch(/blank line/i)
  })

  it('catches an agent placeholder that nobody corrected', () => {
    const p = checkValue(field({ id: 'appNo', label: 'Application No' }), 'my best estimate — please correct this')
    expect(p?.severity).toBe('error')
    expect(p?.problem).toMatch(/placeholder/i)
  })

  it('catches a percentage outside 0–100', () => {
    expect(checkValue(field({ id: 'marks', label: '% of Marks', type: 'number' }), '412')).not.toBeNull()
    expect(checkValue(field({ id: 'marks', label: '% of Marks', type: 'number' }), '78')).toBeNull()
  })

  it('flags a name that is keyboard mash, but not an unusual real name', () => {
    expect(checkValue(field({ id: 'fatherName', label: "Father's Name" }), 'zxcvbnbvcxsz')?.severity).toBe('warning')
    expect(checkValue(field({ id: 'fullName', label: 'Student Full Name' }), 'Lisa Mehta')).toBeNull()
    expect(checkValue(field({ id: 'fullName', label: 'Student Full Name' }), 'Ng')).toBeNull()
  })

  it('does not treat every field with "birth" in it as a date', () => {
    // "Place of Birth — Chennai" was flagged as "not a recognisable date".
    expect(checkValue(field({ id: 'placeOfBirth', label: 'Place of Birth' }), 'Chennai')).toBeNull()
  })

  it('leaves a plain text field alone', () => {
    expect(checkValue(field({ id: 'city', label: 'Passport Issuing City' }), 'Chennai')).toBeNull()
  })
})

describe('checkRecordValues', () => {
  const fields = [
    field({ id: 'fullName', label: 'Student Full Name' }),
    field({ id: 'emailId', label: 'Email Id' }),
    field({ id: 'mobileNumber', label: 'Mobile Number' }),
    field({ id: 'nationality', label: 'Nationality' }),
  ]

  it('reports every malformed answer and nothing else', () => {
    const problems = checkRecordValues(
      fields,
      values({ fullName: 'Lisa', emailId: 'lisamehts', mobileNumber: 'dvbnhgfdsa', nationality: '' }),
    )
    expect(problems.map((p) => p.fieldId)).toEqual(['emailId', 'mobileNumber'])
  })

  it('puts the definite errors before the things merely worth a look', () => {
    const problems = checkRecordValues(
      [field({ id: 'fatherName', label: "Father's Name" }), field({ id: 'emailId', label: 'Email Id' })],
      values({ fatherName: 'zxcvbnbvcxsz', emailId: 'nope' }),
    )
    expect(problems[0].severity).toBe('error')
  })

  it('says nothing at all about a well-formed record', () => {
    expect(
      checkRecordValues(fields, values({ fullName: 'Lisa Mehta', emailId: 'l@example.edu', mobileNumber: '9876543210' })),
    ).toEqual([])
  })

  it('phrases a problem as a sentence the agent can say out loud', () => {
    const [p] = checkRecordValues([field({ id: 'emailId', label: 'Email Id' })], values({ emailId: 'lisamehts' }))
    expect(describeProblem(p)).toBe(
      'Email Id — “lisamehts” is not a valid email address; expected something like name@example.com.',
    )
  })
})
