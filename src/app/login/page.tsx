import { Suspense } from "react";
import { Button, Field, Input, Notice, PageShell, Panel, firstParam } from "@/components/ui";
import { signIn, signUp } from "./actions";

export default function LoginPage(props: PageProps<"/login">) {
  return (
    <PageShell title="Almanac">
      <Panel title="Sign in">
        <p className="mb-5 text-lg text-ink-muted">
          The whole household shares one login. Everyone gets their own profile once you&apos;re in.
        </p>
        <Suspense>
          <Messages searchParams={props.searchParams} />
        </Suspense>
        <form className="mt-4 flex flex-col gap-4">
          <Field label="Email">
            <Input name="email" type="email" autoComplete="email" required />
          </Field>
          <Field label="Password" hint="At least 8 characters.">
            <Input name="password" type="password" autoComplete="current-password" required minLength={8} />
          </Field>
          <div className="flex flex-wrap gap-3">
            <Button formAction={signIn}>Sign in</Button>
            <Button formAction={signUp} variant="secondary">
              Create household login
            </Button>
          </div>
        </form>
      </Panel>
    </PageShell>
  );
}

async function Messages({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const params = await searchParams;
  const error = firstParam(params.error);
  const message = firstParam(params.message);
  return (
    <>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {message ? <Notice tone="success">{message}</Notice> : null}
    </>
  );
}
