import * as React from 'react'
export const Probe = { react: React, version: React.version }
export default function BrokenPanel() { throw new Error('MF2 render positive control') }
