import type { RosterStudent, SessionPlayer } from '../types/models';

export function getStudentName(student: RosterStudent | SessionPlayer): string {
  if ('name' in student) return student.name;
  if ('nickname' in student) return student.nickname;
  return 'Unknown';
}

export function getStudentNumber(student: RosterStudent | SessionPlayer): string | undefined {
  if ('studentNumber' in student) return student.studentNumber;
  return undefined;
}
