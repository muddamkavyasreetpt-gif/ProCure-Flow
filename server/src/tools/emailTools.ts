import { z } from 'zod';
import { supabase } from '../db/supabase';
import { RegisteredTool, ToolResult, ToolContext } from './types';

const notifyUserSchema = z.object({
  subject: z.string().min(1),
  body: z.string().min(1)
});

const sendEmailSchema = z.object({
  to: z.string().min(1),
  subject: z.string().min(1),
  body: z.string().min(1)
});

export const emailTools: RegisteredTool[] = [
  {
    definition: {
      name: 'notify_user',
      description:
        'Send an approval notification to the appropriate human approvers (recipient role bound server-side).',
      parameters: {
        type: 'object',
        properties: {
          subject: { type: 'string', description: 'Notification subject line.' },
          body: { type: 'string', description: 'Notification message explaining the escalation reason.' }
        },
        required: ['subject', 'body']
      }
    },
    schema: notifyUserSchema,
    handler: async (args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> => {
      const subject = String(args.subject);
      const body = String(args.body);
      const role = ctx.requiredApprovalRole || 'manager';

      let recipientEmail = role === 'finance' ? 'finance@procureflow.demo' : 'manager@procureflow.demo';

      const { data: approvers } = await supabase
        .from('users')
        .select('email, role, department_id')
        .eq('role', role);

      if (approvers && approvers.length > 0) {
        const deptMatch = approvers.find((a: any) => a.department_id === ctx.departmentId);
        recipientEmail = (deptMatch || approvers[0]).email;
      }

      const { data: notif, error } = await supabase
        .from('notifications')
        .insert({
          run_id: ctx.runId,
          recipient_email: recipientEmail,
          subject,
          body
        })
        .select()
        .single();

      if (error) {
        return { success: false, error: error.message };
      }

      return {
        success: true,
        data: {
          notificationId: notif?.id,
          recipientEmail,
          subject
        }
      };
    }
  },
  {
    definition: {
      name: 'send_email',
      description:
        'Send an email notification (written to the notifications outbox). Recipients are restricted to the selected vendor contact email and the requester email.',
      parameters: {
        type: 'object',
        properties: {
          to: { type: 'string', description: 'Recipient email address (vendor contact or requester).' },
          subject: { type: 'string', description: 'Email subject line.' },
          body: { type: 'string', description: 'Email body content.' }
        },
        required: ['to', 'subject', 'body']
      }
    },
    schema: sendEmailSchema,
    handler: async (args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> => {
      const rawTo = String(args.to).trim().toLowerCase();
      const subject = String(args.subject);
      const body = String(args.body);

      const allowed = new Set<string>(
        [ctx.requesterEmail, ctx.selectedVendorEmail].filter(Boolean).map((e) => String(e).toLowerCase())
      );

      let recipientEmail = rawTo;
      if (!allowed.has(rawTo)) {
        // Map to vendor or requester based on intent if LLM supplied a placeholder address
        if (rawTo.includes('vendor') || rawTo.includes('sales') || rawTo.includes('order')) {
          recipientEmail = ctx.selectedVendorEmail || ctx.requesterEmail;
        } else {
          recipientEmail = ctx.requesterEmail;
        }
      }

      const { data: notif, error } = await supabase
        .from('notifications')
        .insert({
          run_id: ctx.runId,
          recipient_email: recipientEmail,
          subject,
          body
        })
        .select()
        .single();

      if (error) {
        return { success: false, error: error.message };
      }

      return {
        success: true,
        data: {
          notificationId: notif?.id,
          to: recipientEmail,
          subject,
          body
        }
      };
    }
  }
];
