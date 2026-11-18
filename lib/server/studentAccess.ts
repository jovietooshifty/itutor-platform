// The signed-in student, for routes that act on the student's OWN account
// (their saved cards). Never takes an id from the client.

import { getServerClient, getServiceClient } from '@/lib/supabase/server';

export class StudentAccessError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function requireStudentContext() {
  const server = await getServerClient();
  const admin = getServiceClient();
  const {
    data: { user },
  } = await server.auth.getUser();
  if (!user) throw new StudentAccessError('Unauthorized', 401);
  const { data: profile } = await admin.from('profiles').select('id, role').eq('id', user.id).maybeSingle();
  if (!profile) throw new StudentAccessError('Profile not found', 404);
  if ((profile as { role: string }).role !== 'student') throw new StudentAccessError('Only students can access this resource', 403);
  return { admin, studentId: (profile as { id: string }).id };
}
