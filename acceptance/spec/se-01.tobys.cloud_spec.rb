require_relative 'spec_helper'

# Caddy on se-01's Tailscale address. SE01_URL is set on the Nomad job
# (nomad/acceptance-tests.hcl). Failure here means that job or Caddy
# (nomad/se-01-web.hcl) is down. It does not cross the public anycast path.
describe 'se-01', type: :feature do
  def base_url
    ENV.fetch('SE01_URL')
  end

  it 'answers HTTP over the tailscale address' do
    page = agent.get("#{base_url}/")
    expect(page.code.to_i).to eq(200)
    expect(page.body).to match(/^ok se-01 se-01\n?$/)
    expect(page.response['x-backend']).to eq('se-01')
  end
end
