import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // 1. Create Customers
  const customersData = [
    { name: 'Sarah Tech', email: 'sarah@startup.io', phone: '+1234567890', predicted_preferred_channel: 'EMAIL', is_vip_rigid_routing: true },
    { name: 'Mike Casual', email: 'mike@gmail.com', phone: '+1987654321', predicted_preferred_channel: 'WHATSAPP', is_vip_rigid_routing: false },
    { name: 'Emma SMS', email: null, phone: '+1122334455', predicted_preferred_channel: 'SMS', is_vip_rigid_routing: false },
    { name: 'Alex RCS', email: 'alex@company.com', phone: '+1555666777', predicted_preferred_channel: 'RCS', is_vip_rigid_routing: false },
    { name: 'Olivia Premium', email: 'olivia@enterprise.com', phone: '+1999888777', predicted_preferred_channel: 'WHATSAPP', is_vip_rigid_routing: true },
  ];

  const customers = [];
  for (const c of customersData) {
    const created = await prisma.customer.create({ data: c });
    customers.push(created);
  }
  console.log(`✅ Created ${customers.length} customers.`);

  // 2. Create historical campaigns
  const campaignsData = [
    { name: 'Black Friday Blast', status: 'COMPLETED', target_segment_query: 'all', ai_generated: false },
    { name: 'Re-engagement Q3', status: 'COMPLETED', target_segment_query: 'inactive_30d', ai_generated: true },
    { name: 'VIP Early Access', status: 'ACTIVE', target_segment_query: 'vip_only', ai_generated: true },
  ];

  const campaigns = [];
  for (const camp of campaignsData) {
    const created = await prisma.campaign.create({ data: camp });
    campaigns.push(created);
  }
  console.log(`✅ Created ${campaigns.length} campaigns.`);

  // 3. Create historical message logs to train the AI
  const statuses = ['DELIVERED', 'OPENED', 'CLICKED', 'FAILED'];
  let logCount = 0;

  for (const campaign of campaigns) {
    for (const customer of customers) {
      // Randomize history a bit
      const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
      
      await prisma.messageLog.create({
        data: {
          campaign_id: campaign.id,
          customer_id: customer.id,
          channel: customer.predicted_preferred_channel,
          current_status: randomStatus,
          status_sequence_number: Math.floor(Math.random() * 3) + 1,
          idempotency_key: crypto.randomUUID(),
        }
      });
      logCount++;
    }
  }
  
  console.log(`✅ Created ${logCount} historical message logs.`);
  console.log('🎉 Database seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:');
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
