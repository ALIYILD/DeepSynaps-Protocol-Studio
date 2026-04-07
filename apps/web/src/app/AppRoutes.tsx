import { Route, Routes } from "react-router-dom";

import { AppShell } from "../components/layout/AppShell";
import { AssessmentBuilderPage } from "../pages/AssessmentBuilderPage";
import LoginPage from "../pages/LoginPage";
import { BrainRegionsPage } from "../pages/BrainRegionsPage";
import { DashboardPage } from "../pages/DashboardPage";
import { DeviceRegistryPage } from "../pages/DeviceRegistryPage";
import { EvidenceLibraryPage } from "../pages/EvidenceLibraryPage";
import { GovernanceSafetyPage } from "../pages/GovernanceSafetyPage";
import { HandbooksPage } from "../pages/HandbooksPage";
import { NotFoundPage } from "../pages/NotFoundPage";
import { PricingAccessPage } from "../pages/PricingAccessPage";
import { ProtocolsPage } from "../pages/ProtocolsPage";
import { QEEGMapsPage } from "../pages/QEEGMapsPage";
import { UploadReviewPage } from "../pages/UploadReviewPage";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="/evidence-library" element={<EvidenceLibraryPage />} />
        <Route path="/device-registry" element={<DeviceRegistryPage />} />
        <Route path="/assessment-builder" element={<AssessmentBuilderPage />} />
        <Route path="/protocols" element={<ProtocolsPage />} />
        <Route path="/handbooks" element={<HandbooksPage />} />
        <Route path="/upload-review" element={<UploadReviewPage />} />
        <Route path="/governance-safety" element={<GovernanceSafetyPage />} />
        <Route path="/pricing-access" element={<PricingAccessPage />} />
        <Route path="/brain-regions" element={<BrainRegionsPage />} />
        <Route path="/qeeg-maps" element={<QEEGMapsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
