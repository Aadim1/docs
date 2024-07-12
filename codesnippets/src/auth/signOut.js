// [[start]]
import { signOut } from 'aws-amplify/auth';
// [[end]]

const wrapperSignOut = async () => {
  // [[start]]
  await signOut();
  // [[end]]
};
