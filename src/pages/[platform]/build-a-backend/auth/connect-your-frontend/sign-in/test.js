import { signOut } from 'aws-amplify/auth';

export async function SignOut() {
  await signOut();
}
