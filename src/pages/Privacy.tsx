import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Download, Trash2, Shield, ArrowLeft } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

const Privacy = () => {
  const navigate = useNavigate();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleExport = () => {
    toast.info("Export feature will be available after authentication is set up");
  };

  const handleDelete = () => {
    if (!showDeleteConfirm) {
      setShowDeleteConfirm(true);
      return;
    }
    toast.info("Delete feature will be available after authentication is set up");
    setShowDeleteConfirm(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary/20">
      <div className="container max-w-4xl mx-auto px-4 py-12">
        {/* Header with Back Button */}
        <div className="mb-8">
          <Button
            variant="ghost"
            className="mb-4"
            onClick={() => navigate('/dashboard')}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
          <div className="flex items-center gap-3 mb-4">
            <Shield className="w-10 h-10 text-primary" />
            <h1 className="text-4xl font-bold text-foreground">Privacy & Data Control</h1>
          </div>
          <p className="text-muted-foreground text-lg">
            Your data, your control. Export or delete your information anytime while
            using Man Friday, your AI executive assistant in WhatsApp.
          </p>
        </div>

        {/* Data Control Actions */}
        <Card className="p-6 mb-6">
          <h2 className="text-2xl font-semibold mb-6">Your Data Rights</h2>
          
          <div className="space-y-4">
            {/* Export Data */}
            <div className="p-4 border border-border rounded-lg hover:border-primary/40 transition-all">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Download className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">Export Your Data</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Download a complete copy of your data in JSON format
                    </p>
                  </div>
                </div>
              </div>
              <div className="pl-11">
                <p className="text-sm text-muted-foreground mb-3">
                  Includes: Messages, reminders, preferences, and activity logs
                </p>
                <Button onClick={handleExport}>
                  <Download className="w-4 h-4 mr-2" />
                  Export Data
                </Button>
              </div>
            </div>

            {/* Delete Account */}
            <div className="p-4 border border-destructive/20 bg-destructive/5 rounded-lg">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-destructive/10 rounded-lg">
                    <Trash2 className="w-5 h-5 text-destructive" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">Delete Your Account</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Permanently delete all your data from our systems
                    </p>
                  </div>
                </div>
              </div>
              <div className="pl-11">
                <div className="flex items-start gap-2 mb-3 p-3 bg-warning/10 border border-warning/20 rounded-lg">
                  <AlertTriangle className="w-4 h-4 text-warning mt-0.5 flex-shrink-0" />
                  <div className="text-sm">
                    <p className="font-semibold text-warning mb-1">This action cannot be undone</p>
                    <p className="text-muted-foreground">
                      All your messages, reminders, OAuth tokens, and settings will be permanently deleted.
                      This includes disconnecting from Google Workspace and WhatsApp.
                    </p>
                  </div>
                </div>
                {!showDeleteConfirm ? (
                  <Button variant="destructive" onClick={handleDelete}>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete My Account
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-destructive">
                      Are you absolutely sure?
                    </p>
                    <div className="flex gap-2">
                      <Button variant="destructive" onClick={handleDelete}>
                        Yes, Delete Everything
                      </Button>
                      <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card>

        {/* Privacy Information */}
        <Card className="p-6 mb-6">
          <h2 className="text-2xl font-semibold mb-6">What We Collect</h2>
          
          <div className="space-y-4 text-sm">
            <div>
              <h3 className="font-semibold text-base mb-2">Account Information</h3>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground pl-2">
                <li>WhatsApp phone number</li>
                <li>Google account email and name</li>
                <li>Timezone preference</li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-base mb-2">Activity Data</h3>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground pl-2">
                <li>Messages sent to and from the assistant</li>
                <li>Reminders and their status</li>
                <li>Service usage logs (with PII redaction)</li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-base mb-2">Google Workspace Data (with your permission)</h3>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground pl-2">
                <li>Calendar events (read and create)</li>
                <li>Email summaries (read only)</li>
                <li>Tasks (read and create)</li>
                <li>Contacts (read only for name lookup)</li>
              </ul>
            </div>
          </div>
        </Card>

        {/* Security Information */}
        <Card className="p-6 border-success/20 bg-success/5">
          <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
            <Shield className="w-6 h-6 text-success" />
            How We Protect Your Data
          </h2>
          
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="text-success mt-0.5">✓</span>
              <span>All data encrypted in transit (HTTPS/TLS) and at rest (AES-256)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-success mt-0.5">✓</span>
              <span>OAuth tokens stored with encryption</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-success mt-0.5">✓</span>
              <span>Webhook requests verified with HMAC signatures</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-success mt-0.5">✓</span>
              <span>PII automatically redacted from logs</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-success mt-0.5">✓</span>
              <span>Regular security audits and monitoring</span>
            </li>
          </ul>
        </Card>

        {/* Links */}
        <div className="mt-8 text-center text-sm text-muted-foreground space-y-2">
          <p>
            Read our complete{" "}
            <a href="/PRIVACY_POLICY.md" className="text-primary underline" target="_blank" rel="noopener noreferrer">
              Privacy Policy
            </a>
            {" "}and{" "}
            <a href="/TERMS.md" className="text-primary underline" target="_blank" rel="noopener noreferrer">
              Terms of Service
            </a>
          </p>
          <p>
            Questions? Contact us at{" "}
            <a href="mailto:privacy@yourapp.com" className="text-primary underline">
              privacy@yourapp.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Privacy;
