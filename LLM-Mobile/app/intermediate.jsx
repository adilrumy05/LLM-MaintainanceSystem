import { useEffect } from "react";
import { useRouter } from "expo-router";

export default function Intermediate() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard");
  }, [router]);

  return null;
}
