import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { AppProvider } from "../app/AppContext";
import { PackageGate } from "../components/domain/PackageGate";
import { FEATURES, PACKAGES, hasFeature, minimumPackageFor } from "../lib/packages";
import { PackageId } from "../types/domain";

function renderWithPackage(packageId: PackageId, ui: React.ReactElement) {
  return render(
    <MemoryRouter>
      <AppProvider initialState={{ packageId }}>
        {ui}
      </AppProvider>
    </MemoryRouter>,
  );
}

// ── hasFeature helper ─────────────────────────────────────────────────────────

describe("hasFeature", () => {
  it("returns true for explorer evidence read", () => {
    expect(hasFeature("explorer", FEATURES.EVIDENCE_LIBRARY_READ)).toBe(true);
  });

  it("returns false for explorer protocol generation", () => {
    expect(hasFeature("explorer", FEATURES.PROTOCOL_GENERATE)).toBe(false);
    expect(hasFeature("explorer", FEATURES.PROTOCOL_GENERATE_LIMITED)).toBe(false);
  });

  it("returns true for resident protocol_generate_limited", () => {
    expect(hasFeature("resident", FEATURES.PROTOCOL_GENERATE_LIMITED)).toBe(true);
  });

  it("returns false for resident protocol_generate (full)", () => {
    expect(hasFeature("resident", FEATURES.PROTOCOL_GENERATE)).toBe(false);
  });

  it("returns false for resident uploads", () => {
    expect(hasFeature("resident", FEATURES.UPLOADS_CASE_FILES)).toBe(false);
  });

  it("returns true for clinician_pro uploads", () => {
    expect(hasFeature("clinician_pro", FEATURES.UPLOADS_CASE_FILES)).toBe(true);
  });

  it("returns false for clinician_pro phenotype_mapping (add-on only)", () => {
    expect(hasFeature("clinician_pro", FEATURES.PHENOTYPE_MAPPING)).toBe(false);
  });

  it("returns true for clinic_team phenotype_mapping", () => {
    expect(hasFeature("clinic_team", FEATURES.PHENOTYPE_MAPPING)).toBe(true);
  });

  it("returns true for enterprise api_access", () => {
    expect(hasFeature("enterprise", FEATURES.API_ACCESS)).toBe(true);
  });

  it("returns false for clinic_team api_access", () => {
    expect(hasFeature("clinic_team", FEATURES.API_ACCESS)).toBe(false);
  });
});

// ── minimumPackageFor ─────────────────────────────────────────────────────────

describe("minimumPackageFor", () => {
  it("returns explorer for evidence_library.read", () => {
    expect(minimumPackageFor(FEATURES.EVIDENCE_LIBRARY_READ)?.id).toBe("explorer");
  });

  it("returns resident for protocol.generate_limited", () => {
    expect(minimumPackageFor(FEATURES.PROTOCOL_GENERATE_LIMITED)?.id).toBe("resident");
  });

  it("returns clinician_pro for uploads.case_files", () => {
    expect(minimumPackageFor(FEATURES.UPLOADS_CASE_FILES)?.id).toBe("clinician_pro");
  });

  it("returns clinic_team for phenotype_mapping.use", () => {
    expect(minimumPackageFor(FEATURES.PHENOTYPE_MAPPING)?.id).toBe("clinic_team");
  });

  it("returns enterprise for api.access", () => {
    expect(minimumPackageFor(FEATURES.API_ACCESS)?.id).toBe("enterprise");
  });
});

// ── PackageGate component ─────────────────────────────────────────────────────

describe("PackageGate", () => {
  it("renders children when package includes the feature", () => {
    renderWithPackage(
      "clinician_pro",
      <PackageGate feature={FEATURES.UPLOADS_CASE_FILES}>
        <p>Upload workspace</p>
      </PackageGate>,
    );
    expect(screen.getByText("Upload workspace")).toBeInTheDocument();
  });

  it("renders upgrade prompt when feature is not included", () => {
    renderWithPackage(
      "resident",
      <PackageGate feature={FEATURES.UPLOADS_CASE_FILES}>
        <p>Upload workspace</p>
      </PackageGate>,
    );
    expect(screen.queryByText("Upload workspace")).not.toBeInTheDocument();
    expect(screen.getByText("This feature is not included in your current plan")).toBeInTheDocument();
  });

  it("renders custom fallback when provided", () => {
    renderWithPackage(
      "explorer",
      <PackageGate
        feature={FEATURES.PROTOCOL_GENERATE}
        fallback={<p>Custom upgrade message</p>}
      >
        <p>Protocol generator</p>
      </PackageGate>,
    );
    expect(screen.getByText("Custom upgrade message")).toBeInTheDocument();
    expect(screen.queryByText("Protocol generator")).not.toBeInTheDocument();
  });

  it("shows the minimum required plan in the upgrade prompt", () => {
    renderWithPackage(
      "explorer",
      <PackageGate feature={FEATURES.UPLOADS_CASE_FILES}>
        <p>Hidden content</p>
      </PackageGate>,
    );
    expect(screen.getByText(/Clinician Pro/)).toBeInTheDocument();
  });

  it("enterprise has access to all features", () => {
    const features = [
      FEATURES.PROTOCOL_GENERATE,
      FEATURES.UPLOADS_CASE_FILES,
      FEATURES.API_ACCESS,
      FEATURES.BRANDING_WHITELABEL_FULL,
    ];
    features.forEach((feature) => {
      expect(hasFeature("enterprise", feature)).toBe(true);
    });
  });

  it("renders children when anyOf contains a matching feature", () => {
    renderWithPackage(
      "clinician_pro",
      <PackageGate anyOf={[FEATURES.PROTOCOL_GENERATE, FEATURES.PROTOCOL_GENERATE_LIMITED]}>
        <p>Protocol generator</p>
      </PackageGate>,
    );
    expect(screen.getByText("Protocol generator")).toBeInTheDocument();
  });

  it("renders upgrade prompt when none of anyOf features are present", () => {
    renderWithPackage(
      "explorer",
      <PackageGate anyOf={[FEATURES.PROTOCOL_GENERATE, FEATURES.PROTOCOL_GENERATE_LIMITED]}>
        <p>Protocol generator</p>
      </PackageGate>,
    );
    expect(screen.queryByText("Protocol generator")).not.toBeInTheDocument();
    expect(screen.getByText("This feature is not included in your current plan")).toBeInTheDocument();
  });
});

// ── Package structure integrity ───────────────────────────────────────────────

describe("Package structure integrity", () => {
  it("all packages have required fields", () => {
    const ids: PackageId[] = ["explorer", "resident", "clinician_pro", "clinic_team", "enterprise"];
    ids.forEach((id) => {
      const pkg = PACKAGES[id];
      expect(pkg.id).toBe(id);
      expect(pkg.displayName).toBeTruthy();
      expect(pkg.features).toBeInstanceOf(Set);
      expect(pkg.features.size).toBeGreaterThan(0);
    });
  });

  it("enterprise is a superset of clinic_team features", () => {
    const clinicTeam = PACKAGES["clinic_team"].features;
    const enterprise = PACKAGES["enterprise"].features;
    for (const f of clinicTeam) {
      expect(enterprise.has(f)).toBe(true);
    }
  });

  it("clinician_pro provides at least equivalent access area coverage as resident", () => {
    // clinician_pro uses higher-tier variants (e.g. PROTOCOL_GENERATE instead of PROTOCOL_GENERATE_LIMITED)
    // so it is not a strict superset, but it covers all functional areas that resident covers.
    expect(hasFeature("clinician_pro", FEATURES.PROTOCOL_GENERATE)).toBe(true);
    expect(hasFeature("clinician_pro", FEATURES.HANDBOOK_GENERATE_FULL)).toBe(true);
    expect(hasFeature("clinician_pro", FEATURES.ASSESSMENT_BUILDER_FULL)).toBe(true);
    expect(hasFeature("clinician_pro", FEATURES.EXPORTS_PDF)).toBe(true);
  });

  it("governance: no package grants EV-D bypass (no such feature exists)", () => {
    const allFeatures = Object.values(FEATURES);
    const evdBypass = allFeatures.filter((f) => f.includes("ev_d"));
    expect(evdBypass).toHaveLength(0);
  });
});
