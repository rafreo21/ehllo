"use client";

import { ArrowRight as ArrowRightIcon } from "react-feather";
import { BuildingsIcon } from "@phosphor-icons/react/dist/csr/Buildings";
import { User as UserIcon } from "react-feather";
import { Button } from "../components/Button";

export function OnboardingUseCase() {
  function continueFlow() {
    window.location.assign("/onboarding/card");
  }

  return (
    <div className="onboarding-use-case">
      <fieldset className="onboarding-choices">
        <legend className="sr-only">How will you use ehllo?</legend>
        <label className="onboarding-choice selected">
          <input type="radio" name="use-case" value="personal" checked readOnly />
          <span className="onboarding-choice-icon" aria-hidden="true"><UserIcon size={22} /></span>
          <span className="onboarding-choice-copy">
            <strong>For me only</strong>
            <small>Create your card, share it at events, and remember the people you meet.</small>
          </span>
        </label>
        <div className="onboarding-choice disabled" aria-disabled="true">
          <span className="onboarding-choice-icon" aria-hidden="true"><BuildingsIcon size={22} weight="bold" /></span>
          <span className="onboarding-choice-copy">
            <strong>For my team or company <span className="onboarding-choice-badge">Coming soon</span></strong>
            <small>Set up a shared workspace first. You can add branded cards for members later.</small>
          </span>
        </div>
      </fieldset>
      <Button fullWidth type="button" onClick={continueFlow}>
        Continue <ArrowRightIcon size={20} />
      </Button>
    </div>
  );
}
